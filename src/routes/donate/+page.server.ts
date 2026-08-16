import { and, desc, eq, isNull } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { randomUUID } from 'node:crypto';
import { db } from '$lib/server/db';
import {
	donations,
	donors,
	futureInitiatives,
	newsletterSubscribers,
	paymentAccounts,
	pillars,
	recurringPledges,
	regions
} from '$lib/server/db/schema';
import {
	getDonationCampaigns,
	getInitiatives,
	getPage,
	getPaymentOptions,
	getPillars
} from '$lib/server/content';
import { hydrateBlocks } from '$lib/server/pageData';
import { getImpactMetrics } from '$lib/server/impact';
import { nextDonationReference } from '$lib/server/reference';
import { sendEmail, donationPledgeTemplate } from '$lib/server/email';
import { formatMoney } from '$lib/money';
import { audit } from '$lib/server/audit';
import { donateSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The donation flow.
 *
 * The shape is drawn from the church system's donate page, adjusted for two
 * facts about this Foundation:
 *
 *  - **A "monthly donor" here is a pledge, not an auto-debit.** True recurring
 *    charges do not exist on CBE transfers, so choosing "monthly" creates a
 *    `recurring_pledges` row with a reminder date, and each month's actual gift
 *    becomes its own `donations` row when it lands (§3.5).
 *  - **Nothing counts as money until finance says so.** Every gift starts at
 *    `pending_reconciliation`, and the impact counters only sum `completed`
 *    donations — so the public "funds raised" figure can never show money that
 *    has not arrived.
 */

export const load: PageServerLoad = async ({ url }) => {
	const requestedPillar = url.searchParams.get('pillar');

	const [page, pillarRows, initiatives, payments, campaigns, metrics] = await Promise.all([
		getPage('donate'),
		getPillars(),
		getInitiatives(),
		getPaymentOptions(),
		getDonationCampaigns(),
		getImpactMetrics()
	]);

	const blockData = page ? await hydrateBlocks(page.blocks) : null;

	const preselected = requestedPillar
		? (pillarRows.find((pillar) => pillar.slug === requestedPillar) ?? null)
		: null;

	const form = await superValidate(zod4(donateSchema), {
		defaults: {
			amount: 0,
			frequency: 'one_time',
			designationType: preselected ? 'pillar' : 'general_fund',
			designationPillarId: preselected?.id ?? null,
			designationInitiativeId: null,
			paymentAccountId: payments[0]?.accountId ?? null,
			donorName: '',
			donorEmail: '',
			donorPhone: '',
			isDiaspora: false,
			isAnonymous: false,
			donorMessage: '',
			joinNewsletter: false,
			website: ''
		}
	});

	return {
		page,
		pillars: pillarRows,
		initiatives,
		payments,
		campaigns,
		metrics: metrics.values,
		blocks: blockData,
		preselectedPillarId: preselected?.id ?? null,
		form
	};
};

/** A pledge's first reminder falls one month out, on the same day. */
function nextMonth(): string {
	const date = new Date();
	date.setMonth(date.getMonth() + 1);
	return date.toISOString().slice(0, 10);
}

export const actions: Actions = {
	donate: async (event) => {
		const form = await superValidate(event.request, zod4(donateSchema));

		if (!form.valid) {
			return message(
				form,
				{ type: 'error', text: 'Please check the form for errors' },
				{ status: 400 }
			);
		}

		if (form.data.website) {
			// Honeypot — accepted silently, stored nowhere.
			return message(form, { type: 'success', text: 'Thank you.' });
		}

		const data = form.data;

		try {
			// The currency and the designation are re-read from the database rather
			// than taken from the post: a donor's browser does not get to decide
			// which pillar a gift is credited to or what currency it is counted in.
			const [account] = data.paymentAccountId
				? await db
						.select({
							id: paymentAccounts.id,
							currency: paymentAccounts.currency,
							accountName: paymentAccounts.accountName,
							accountNumber: paymentAccounts.accountNumber,
							bankName: paymentAccounts.bankName,
							swiftCode: paymentAccounts.swiftCode,
							paymentMethodId: paymentAccounts.paymentMethodId
						})
						.from(paymentAccounts)
						.where(
							and(
								eq(paymentAccounts.id, data.paymentAccountId),
								eq(paymentAccounts.isActive, true),
								isNull(paymentAccounts.deletedAt)
							)
						)
						.limit(1)
				: [];

			const [pillar] =
				data.designationType === 'pillar' && data.designationPillarId
					? await db
							.select({ id: pillars.id, name: pillars.name })
							.from(pillars)
							.where(and(eq(pillars.id, data.designationPillarId), isNull(pillars.deletedAt)))
							.limit(1)
					: [];

			const [initiative] =
				data.designationType === 'future_initiative' && data.designationInitiativeId
					? await db
							.select({ id: futureInitiatives.id, name: futureInitiatives.name })
							.from(futureInitiatives)
							.where(
								and(
									eq(futureInitiatives.id, data.designationInitiativeId),
									isNull(futureInitiatives.deletedAt)
								)
							)
							.limit(1)
					: [];

			// A designation the database cannot confirm falls back to the general
			// fund rather than being stored as a dangling reference.
			const designationType = pillar ? 'pillar' : initiative ? 'future_initiative' : 'general_fund';

			const currency = account?.currency ?? 'ETB';
			const email = data.donorEmail?.trim().toLowerCase() || null;

			const donorId = await upsertDonor({
				fullName: data.donorName,
				email,
				phone: data.donorPhone?.trim() || null,
				isDiaspora: data.isDiaspora,
				userId: event.locals.user?.id ?? null
			});

			const [defaultRegion] = await db
				.select({ id: regions.id })
				.from(regions)
				.where(and(eq(regions.isDefault, true), isNull(regions.deletedAt)))
				.limit(1);

			// A monthly gift is a pledge plus this month's donation: the pledge is
			// the standing commitment that generates reminders, the donation is the
			// transfer we are expecting now.
			let pledgeId: number | null = null;
			if (data.frequency === 'monthly') {
				const [pledge] = await db
					.insert(recurringPledges)
					.values({
						donorId,
						amount: data.amount,
						currency,
						designationType,
						designationPillarId: pillar?.id ?? null,
						designationInitiativeId: initiative?.id ?? null,
						status: 'active',
						nextReminderDate: nextMonth(),
						reminderChannel: email ? 'email' : 'sms',
						startedAt: new Date()
					})
					.returning({ id: recurringPledges.id });
				pledgeId = pledge.id;
			}

			const referenceCode = nextDonationReference();

			const [donation] = await db
				.insert(donations)
				.values({
					donorId,
					amount: data.amount,
					currency,
					frequency: data.frequency,
					designationType,
					designationPillarId: pillar?.id ?? null,
					designationInitiativeId: initiative?.id ?? null,
					paymentMethodId: account?.paymentMethodId ?? null,
					paymentAccountId: account?.id ?? null,
					// Not `completed`: nobody has seen this money yet. Finance moves it
					// on in the reconciliation queue, and only then does it count.
					status: 'pending_reconciliation',
					referenceCode,
					donorMessage: data.donorMessage?.trim() || null,
					isAnonymous: data.isAnonymous,
					recurringPledgeId: pledgeId,
					regionId: defaultRegion?.id ?? null
				})
				.returning({ id: donations.id });

			if (data.joinNewsletter && email) {
				await db
					.insert(newsletterSubscribers)
					.values({
						email,
						name: data.donorName,
						source: 'donation_flow',
						subscribedAt: new Date(),
						unsubscribeToken: randomUUID(),
						createdAt: new Date()
					})
					.onConflictDoNothing();
			}

			audit({
				event,
				action: 'created',
				entityType: 'donation',
				entityId: donation.id,
				metadata: { reference: referenceCode, frequency: data.frequency, designationType }
			});

			if (email && account) {
				const lines = [
					`<strong>${account.accountName}</strong>`,
					account.bankName ?? '',
					`Account: ${account.accountNumber}`,
					account.swiftCode ? `SWIFT: ${account.swiftCode}` : ''
				].filter(Boolean);

				const mail = donationPledgeTemplate(
					data.donorName,
					formatMoney(data.amount, currency),
					referenceCode,
					lines
				);
				// Non-blocking: the gift is already recorded, and a slow mail server
				// must not turn a successful donation into an error page.
				void sendEmail(email, mail.subject, mail.html).catch((err) =>
					console.error('donation email failed', err)
				);
			}

			return message(form, {
				type: 'success',
				text: 'Thank you. Complete your transfer using the reference below and we will confirm your gift.',
				reference: referenceCode,
				amount: formatMoney(data.amount, currency)
			});
		} catch (err) {
			console.error('Donation failed:', err);
			return message(
				form,
				{ type: 'error', text: 'We could not record your gift. Please try again.' },
				{ status: 500 }
			);
		}
	}
};

/**
 * Finds the donor behind this gift, or creates them.
 *
 * Matching is on email first, then phone — a donor who gives three times a
 * year should be one row with a lifetime total, not three rows. `lifetimeTotal`
 * itself is only moved when a donation is reconciled, so it reflects money
 * received rather than money promised.
 */
async function upsertDonor(input: {
	fullName: string;
	email: string | null;
	phone: string | null;
	isDiaspora: boolean;
	userId: string | null;
}): Promise<number> {
	const match = input.email
		? eq(donors.email, input.email)
		: input.phone
			? eq(donors.phone, input.phone)
			: null;

	if (match) {
		const [existing] = await db
			.select({ id: donors.id })
			.from(donors)
			.where(and(match, isNull(donors.deletedAt)))
			.orderBy(desc(donors.id))
			.limit(1);

		if (existing) {
			await db
				.update(donors)
				.set({
					fullName: input.fullName,
					phone: input.phone ?? undefined,
					isDiaspora: input.isDiaspora,
					updatedAt: new Date()
				})
				.where(eq(donors.id, existing.id));
			return existing.id;
		}
	}

	const [created] = await db
		.insert(donors)
		.values({
			fullName: input.fullName,
			email: input.email,
			phone: input.phone,
			isDiaspora: input.isDiaspora,
			userId: input.userId
		})
		.returning({ id: donors.id });

	return created.id;
}
