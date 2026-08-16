import { fail } from '@sveltejs/kit';
import { asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { donors, futureInitiatives, pillars, recurringPledges } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { notifyPledgeReminder } from '$lib/server/notify';
import { nextDonationReference } from '$lib/server/reference';
import { donations } from '$lib/server/db/schema';
import { formatMoney } from '$lib/money';
import { audit, auditList } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * Recurring pledges.
 *
 * A pledge is a promise, not a subscription — CBE transfers cannot be
 * auto-debited, so "monthly donor" here means somebody who gets a reminder and
 * makes a transfer (§3.5). This screen is where finance sends that reminder and
 * opens the resulting donation for reconciliation.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'donations.read');

	const today = new Date().toISOString().slice(0, 10);

	const rows = await db
		.select({
			id: recurringPledges.id,
			amount: recurringPledges.amount,
			currency: recurringPledges.currency,
			status: recurringPledges.status,
			nextReminderDate: recurringPledges.nextReminderDate,
			lastReminderSentAt: recurringPledges.lastReminderSentAt,
			reminderChannel: recurringPledges.reminderChannel,
			designationType: recurringPledges.designationType,
			donorId: donors.id,
			donorName: donors.fullName,
			donorEmail: donors.email,
			donorPhone: donors.phone,
			pillarName: pillars.name,
			initiativeName: futureInitiatives.name
		})
		.from(recurringPledges)
		.leftJoin(donors, eq(donors.id, recurringPledges.donorId))
		.leftJoin(pillars, eq(pillars.id, recurringPledges.designationPillarId))
		.leftJoin(futureInitiatives, eq(futureInitiatives.id, recurringPledges.designationInitiativeId))
		.where(isNull(recurringPledges.deletedAt))
		.orderBy(asc(recurringPledges.nextReminderDate));

	auditList(event, 'recurring_pledge', { results: rows.length });

	return { rows, today };
};

export const actions: Actions = {
	/**
	 * Sends this month's reminder and opens the donation it should produce.
	 *
	 * Creating the donation up front is what makes reconciliation work: the
	 * donor is given a reference code to quote, and finance has something to
	 * match the incoming transfer against.
	 */
	sendReminder: async (event) => {
		await requirePermission(event, 'donations.write');
		const formData = await event.request.formData();
		const id = Number(formData.get('id'));

		const [pledge] = await db
			.select({
				id: recurringPledges.id,
				donorId: recurringPledges.donorId,
				amount: recurringPledges.amount,
				currency: recurringPledges.currency,
				status: recurringPledges.status,
				designationType: recurringPledges.designationType,
				designationPillarId: recurringPledges.designationPillarId,
				designationInitiativeId: recurringPledges.designationInitiativeId,
				channel: recurringPledges.reminderChannel,
				donorName: donors.fullName,
				donorEmail: donors.email
			})
			.from(recurringPledges)
			.leftJoin(donors, eq(donors.id, recurringPledges.donorId))
			.where(eq(recurringPledges.id, id))
			.limit(1);

		if (!pledge) return fail(404, { error: 'That pledge no longer exists.' });
		if (pledge.status !== 'active') {
			return fail(422, { error: 'That pledge is paused or cancelled.' });
		}

		const referenceCode = nextDonationReference();

		await db.insert(donations).values({
			donorId: pledge.donorId,
			amount: pledge.amount,
			currency: pledge.currency,
			frequency: 'monthly',
			designationType: pledge.designationType,
			designationPillarId: pledge.designationPillarId,
			designationInitiativeId: pledge.designationInitiativeId,
			status: 'pending_reconciliation',
			referenceCode,
			recurringPledgeId: pledge.id
		});

		if (pledge.channel === 'email' && pledge.donorEmail) {
			try {
				await notifyPledgeReminder(
					pledge.donorEmail,
					pledge.donorName ?? 'friend',
					formatMoney(pledge.amount, pledge.currency),
					referenceCode
				);
			} catch (err) {
				// The donation row is already open, so the reminder can be re-sent
				// without creating a duplicate.
				console.error('pledge reminder failed', err);
				return fail(500, { error: 'The donation was opened but the email could not be sent.' });
			}
		}

		const next = new Date();
		next.setMonth(next.getMonth() + 1);

		await db
			.update(recurringPledges)
			.set({
				lastReminderSentAt: new Date(),
				nextReminderDate: next.toISOString().slice(0, 10),
				updatedAt: new Date()
			})
			.where(eq(recurringPledges.id, id));

		audit({
			event,
			action: 'updated',
			entityType: 'recurring_pledge',
			entityId: id,
			metadata: { reminderSent: true, reference: referenceCode }
		});

		return { ok: true, reference: referenceCode };
	},

	setStatus: async (event) => {
		await requirePermission(event, 'donations.write');
		const formData = await event.request.formData();
		const id = Number(formData.get('id'));
		const status = String(formData.get('status'));

		if (!['active', 'paused', 'cancelled'].includes(status)) {
			return fail(400, { error: 'Unknown status.' });
		}

		await db
			.update(recurringPledges)
			.set({
				status: status as never,
				cancelledAt: status === 'cancelled' ? new Date() : null,
				updatedAt: new Date()
			})
			.where(eq(recurringPledges.id, id));

		audit({
			event,
			action: 'updated_status',
			entityType: 'recurring_pledge',
			entityId: id,
			metadata: { status }
		});
		return { ok: true };
	}
};
