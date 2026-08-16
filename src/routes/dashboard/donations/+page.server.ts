import { fail } from '@sveltejs/kit';
import { and, desc, eq, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	donationReconciliationLog,
	donations,
	donors,
	futureInitiatives,
	paymentAccounts,
	paymentMethods,
	pillars,
	recurringPledges
} from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { audit, auditList } from '$lib/server/audit';
import { invalidateImpact } from '$lib/server/impact';
import { formatMoney } from '$lib/money';
import { sendEmail, donationReceiptTemplate } from '$lib/server/email';
import type { Actions, PageServerLoad } from './$types';

/**
 * Donation reconciliation.
 *
 * §5.7 calls this out as genuinely bespoke, and it is: the job here is not
 * "edit a row" but "match a line on a bank statement to a pledge somebody made
 * on the website last Tuesday". A generic CRUD grid cannot express that.
 *
 * The workflow the screen supports:
 *
 *   1. A donor pledges on the public site. The donation lands as
 *      `pending_reconciliation` with a reference code they were asked to quote.
 *   2. Finance opens their bank statement, finds a transfer, searches this
 *      queue by reference or amount, and confirms the match.
 *   3. Confirming moves the donation to `completed`, stamps the donor's
 *      lifetime total, writes a reconciliation log row, and — only now — lets
 *      the money count toward the public "funds raised" figure.
 *
 * Nothing is ever `completed` without passing through step 3, which is why the
 * homepage counter can be trusted.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'donations.read');

	const status = event.url.searchParams.get('status') ?? 'pending_reconciliation';
	const search = event.url.searchParams.get('q')?.trim() ?? '';

	const clauses: (SQL | undefined)[] = [isNull(donations.deletedAt)];
	if (status !== 'all') clauses.push(eq(donations.status, status as never));
	if (search) {
		const needle = `%${search}%`;
		clauses.push(
			or(
				like(donations.referenceCode, needle),
				like(donors.fullName, needle),
				like(donors.email, needle),
				like(donors.phone, needle),
				like(donations.providerTransactionId, needle)
			)
		);
	}

	const [rows, totals] = await Promise.all([
		db
			.select({
				id: donations.id,
				reference: donations.referenceCode,
				amount: donations.amount,
				currency: donations.currency,
				frequency: donations.frequency,
				status: donations.status,
				designationType: donations.designationType,
				donorMessage: donations.donorMessage,
				isAnonymous: donations.isAnonymous,
				createdAt: donations.createdAt,
				completedAt: donations.completedAt,
				receiptSentAt: donations.receiptSentAt,
				donorId: donors.id,
				donorName: donors.fullName,
				donorEmail: donors.email,
				donorPhone: donors.phone,
				isDiaspora: donors.isDiaspora,
				pillarName: pillars.name,
				initiativeName: futureInitiatives.name,
				methodName: paymentMethods.name,
				accountNumber: paymentAccounts.accountNumber,
				pledgeId: donations.recurringPledgeId
			})
			.from(donations)
			.leftJoin(donors, eq(donors.id, donations.donorId))
			.leftJoin(pillars, eq(pillars.id, donations.designationPillarId))
			.leftJoin(futureInitiatives, eq(futureInitiatives.id, donations.designationInitiativeId))
			.leftJoin(paymentMethods, eq(paymentMethods.id, donations.paymentMethodId))
			.leftJoin(paymentAccounts, eq(paymentAccounts.id, donations.paymentAccountId))
			.where(and(...(clauses.filter(Boolean) as SQL[])))
			.orderBy(desc(donations.createdAt))
			.limit(500),

		db
			.select({
				status: donations.status,
				total: sql<number>`count(*)`,
				amount: sql<number>`coalesce(sum(${donations.amount}), 0)`
			})
			.from(donations)
			.where(isNull(donations.deletedAt))
			.groupBy(donations.status)
	]);

	auditList(event, 'donation', { status, search, results: rows.length });

	return { rows, totals, filters: { status, search } };
};

export const actions: Actions = {
	/**
	 * Confirms that a pledged donation has actually arrived.
	 *
	 * Three writes that belong together: the donation's status, the donor's
	 * cached lifetime total, and the reconciliation log row that says who made
	 * the match and against which bank reference. They run in a transaction so a
	 * half-reconciled donation cannot exist.
	 */
	reconcile: async (event) => {
		const access = await requirePermission(event, 'donations.reconcile');
		const formData = await event.request.formData();
		const id = Number(formData.get('id'));
		const bankReference = String(formData.get('bankReference') ?? '').trim();
		// Finance may see a different figure on the statement than was pledged.
		const matchedBirr = formData.get('amountMatched');
		const amountMatched =
			matchedBirr && String(matchedBirr).trim() ? Math.round(Number(matchedBirr) * 100) : null;

		if (!Number.isFinite(id)) return fail(400, { error: 'Unknown donation.' });

		const [donation] = await db
			.select({
				id: donations.id,
				amount: donations.amount,
				currency: donations.currency,
				status: donations.status,
				donorId: donations.donorId,
				referenceCode: donations.referenceCode,
				designationType: donations.designationType,
				recurringPledgeId: donations.recurringPledgeId
			})
			.from(donations)
			.where(eq(donations.id, id))
			.limit(1);

		if (!donation) return fail(404, { error: 'That donation no longer exists.' });
		if (donation.status === 'completed') {
			return fail(409, { error: 'That donation has already been reconciled.' });
		}

		const finalAmount = amountMatched ?? donation.amount;
		const now = new Date();

		db.transaction((tx) => {
			tx.update(donations)
				.set({
					status: 'completed',
					amount: finalAmount,
					completedAt: now,
					updatedAt: now
				})
				.where(eq(donations.id, id))
				.run();

			if (donation.donorId) {
				// Recomputed from completed donations rather than incremented: an
				// increment drifts the first time a reconciliation is reversed.
				tx.update(donors)
					.set({
						lifetimeTotal: sql`(
							select coalesce(sum(amount), 0) from donations
							where donor_id = ${donation.donorId} and status = 'completed' and deleted_at is null
						)`,
						donationCount: sql`(
							select count(*) from donations
							where donor_id = ${donation.donorId} and status = 'completed' and deleted_at is null
						)`,
						lastDonationAt: now,
						updatedAt: now
					})
					.where(eq(donors.id, donation.donorId))
					.run();
			}

			tx.insert(donationReconciliationLog)
				.values({
					donationId: id,
					matchedBy: access.userId,
					matchedAt: now,
					bankReferenceNote: bankReference || null,
					previousStatus: donation.status,
					newStatus: 'completed',
					amountMatched: finalAmount,
					createdAt: now
				})
				.run();

			// A reconciled month moves the pledge's reminder on, so the donor is
			// not chased for something they have already sent.
			if (donation.recurringPledgeId) {
				const next = new Date(now);
				next.setMonth(next.getMonth() + 1);
				tx.update(recurringPledges)
					.set({ nextReminderDate: next.toISOString().slice(0, 10), updatedAt: now })
					.where(eq(recurringPledges.id, donation.recurringPledgeId))
					.run();
			}
		});

		// The public counters only sum completed donations, so this is the moment
		// the homepage figure is allowed to move.
		invalidateImpact();

		audit({
			event,
			action: 'reconciled',
			entityType: 'donation',
			entityId: id,
			metadata: { reference: donation.referenceCode, bankReference, amount: finalAmount }
		});

		return { ok: true, reconciled: id };
	},

	/** Marks a pledge that never arrived, so the queue does not grow forever. */
	setStatus: async (event) => {
		const access = await requirePermission(event, 'donations.write');
		const formData = await event.request.formData();
		const id = Number(formData.get('id'));
		const status = String(formData.get('status'));
		const note = String(formData.get('note') ?? '').trim();

		const allowed = ['pending_reconciliation', 'pledged', 'failed', 'cancelled', 'refunded'];
		if (!Number.isFinite(id) || !allowed.includes(status)) {
			return fail(400, { error: 'That is not a status a donation can be moved to here.' });
		}

		const [donation] = await db
			.select({ status: donations.status })
			.from(donations)
			.where(eq(donations.id, id))
			.limit(1);
		if (!donation) return fail(404, { error: 'That donation no longer exists.' });

		const now = new Date();

		await db
			.update(donations)
			.set({ status: status as never, updatedAt: now })
			.where(eq(donations.id, id));

		// Reversing a completed donation has to leave a trail — this is the one
		// place money can leave the public total.
		await db.insert(donationReconciliationLog).values({
			donationId: id,
			matchedBy: access.userId,
			matchedAt: now,
			bankReferenceNote: note || null,
			previousStatus: donation.status,
			newStatus: status,
			createdAt: now
		});

		invalidateImpact();
		audit({
			event,
			action: 'updated_status',
			entityType: 'donation',
			entityId: id,
			metadata: { from: donation.status, to: status, note }
		});

		return { ok: true };
	},

	/** Sends the receipt for a reconciled gift. */
	sendReceipt: async (event) => {
		await requirePermission(event, 'donations.write');
		const formData = await event.request.formData();
		const id = Number(formData.get('id'));

		const [donation] = await db
			.select({
				id: donations.id,
				amount: donations.amount,
				currency: donations.currency,
				status: donations.status,
				reference: donations.referenceCode,
				designationType: donations.designationType,
				donorName: donors.fullName,
				donorEmail: donors.email,
				pillarName: pillars.name,
				initiativeName: futureInitiatives.name
			})
			.from(donations)
			.leftJoin(donors, eq(donors.id, donations.donorId))
			.leftJoin(pillars, eq(pillars.id, donations.designationPillarId))
			.leftJoin(futureInitiatives, eq(futureInitiatives.id, donations.designationInitiativeId))
			.where(eq(donations.id, id))
			.limit(1);

		if (!donation) return fail(404, { error: 'That donation no longer exists.' });
		if (donation.status !== 'completed') {
			return fail(422, { error: 'Reconcile the gift before sending a receipt for it.' });
		}
		if (!donation.donorEmail) {
			return fail(422, { error: 'This donor did not give an email address.' });
		}

		const designation = donation.pillarName ?? donation.initiativeName ?? 'the general fund';

		const mail = donationReceiptTemplate(
			donation.donorName ?? 'friend',
			formatMoney(donation.amount, donation.currency),
			donation.reference,
			designation
		);

		try {
			await sendEmail(donation.donorEmail, mail.subject, mail.html);
		} catch (err) {
			console.error('receipt send failed', err);
			return fail(500, { error: 'The receipt could not be sent. Check the mail settings.' });
		}

		await db.update(donations).set({ receiptSentAt: new Date() }).where(eq(donations.id, id));

		audit({
			event,
			action: 'updated',
			entityType: 'donation',
			entityId: id,
			metadata: { receipt: true }
		});
		return { ok: true, receiptSent: id };
	}
};
