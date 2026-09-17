import { and, eq, isNull } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { randomUUID } from 'node:crypto';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	donations,
	futureInitiatives,
	newsletterSubscribers,
	paymentAccounts,
	pillars,
	recurringPledges,
	regions
} from '$lib/server/db/schema';
import {
	getDonationCampaigns,
	getMediaByOwner,
	getInitiatives,
	getPage,
	getHelpTopics,
	getPaymentOptions,
	getPillars,
	getRegions
} from '$lib/server/content';
import { stringPairs } from '$lib/server/settings';
import { hydrateBlocks } from '$lib/server/pageData';
import { getImpactMetrics } from '$lib/server/impact';
import { createInKindOffer, getInKindCategories } from '$lib/server/inKind';
import { upsertDonor } from '$lib/server/donors';
import { saveUploadedFile, deleteStoredFile } from '$lib/server/upload';
import { notifyNewInKindOffer } from '$lib/server/notify';
import { nextDonationReference, withReference, REFERENCE_PATTERN } from '$lib/server/reference';
import { sendEmail, donationPledgeTemplate, inKindOfferTemplate } from '$lib/server/email';
import { formatMoney } from '$lib/money';
import { blankInKindItem, inKindSchema } from '$lib/inKind';
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

	const [
		page,
		pillarRows,
		initiatives,
		payments,
		campaigns,
		metrics,
		goodsCategories,
		regionRows,
		help,
		helpLabels
	] = await Promise.all([
		getPage('donate'),
		getPillars(),
		getInitiatives(),
		getPaymentOptions(),
		getDonationCampaigns(),
		getImpactMetrics(),
		getInKindCategories(),
		getRegions(),
		getHelpTopics('donate'),
		// The panel's own labels, both languages: the visitor switches, not the
		// server, so `strings` from the layout cannot answer this one.
		stringPairs('help.')
	]);

	const blockData = page ? await hydrateBlocks(page.blocks) : null;

	const preselected = requestedPillar
		? (pillarRows.find((pillar) => pillar.slug === requestedPillar) ?? null)
		: null;

	// A paused category is not a default: the donor would land on a disabled
	// option and have to work out why the form was arguing with them.
	const firstOpen = goodsCategories.find((category) => category.isAcceptingNow);

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
			donorOrganisation: '',
			isDiaspora: false,
			donorCountry: '',
			isAnonymous: false,
			donorMessage: '',
			joinNewsletter: false,
			website: ''
		}
	});

	// The second form on this page. Its own `id` because superforms keys a
	// page's forms by id, and two forms sharing one would post over each other.
	const inKindForm = await superValidate(zod4(inKindSchema), {
		id: 'in-kind',
		defaults: {
			items: [blankInKindItem(firstOpen?.id ?? null, firstOpen?.defaultUnit ?? 'items')],
			valuationBasis: 'donor_estimate',
			hasRestrictedItems: false,
			restrictedItemsNote: '',
			designationType: preselected ? 'pillar' : 'general_fund',
			designationPillarId: preselected?.id ?? null,
			designationInitiativeId: null,
			regionId: regionRows.find((region) => region.isDefault)?.id ?? null,
			handoverMethod: 'dropoff',
			pickupContactName: '',
			pickupContactPhone: '',
			pickupAddressLine: '',
			pickupCity: '',
			pickupLandmark: '',
			accessNotes: '',
			loadSize: 'car_boot',
			estimatedWeightKg: null,
			requiresVehicle: false,
			requiresHelpLoading: false,
			availableFrom: '',
			availableUntil: '',
			donorName: '',
			donorEmail: '',
			donorPhone: '',
			donorType: 'individual',
			organisationName: '',
			isDiaspora: false,
			preferredContactChannel: 'phone',
			bestTimeToContact: '',
			receiptRequested: false,
			taxReceiptRequired: false,
			taxIdNumber: '',
			isAnonymous: false,
			recognitionName: '',
			donorMessage: '',
			heardAbout: '',
			joinNewsletter: false,
			consentToContact: false,
			website: ''
		}
	});

	return {
		page,
		pillars: pillarRows,
		goodsCategories,
		regions: regionRows,
		inKindForm,
		initiatives,
		payments,
		campaigns,
		// Keyed by campaign id, so a card can find its own appeal video.
		campaignVideos: Object.fromEntries(
			Object.entries(
				await getMediaByOwner(
					'campaign',
					campaigns.map((c) => c.id)
				)
			).map(([id, media]) => [id, media.videos])
		),
		metrics: metrics.values,
		// Per currency, never one figure — see `MoneyTotal` in `$lib/money.ts`.
		moneyTotals: metrics.money,
		blocks: blockData,
		help,
		helpLabels,
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
				organisationName: data.donorOrganisation?.trim() || null,
				country: data.donorCountry?.trim() || null,
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

			// Reference and row commit together — see `withReference`.
			const { id: donationId, referenceCode } = withReference(() => {
				const referenceCode = nextDonationReference();

				const [donation] = db
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
					.returning({ id: donations.id })
					.all();

				return { id: donation.id, referenceCode };
			});

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
				entityId: donationId,
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
				void sendEmail({ to: email, ...mail }).catch((err) =>
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
	},

	/**
	 * The donor's own proof of transfer.
	 *
	 * In Ethiopia a transfer is finished by screenshotting the bank app, and
	 * donors send that picture to whoever they gave to — by Telegram, by
	 * WhatsApp, to a phone number on a poster. Asking them to send it here
	 * instead puts it on the donation row, so finance opens one screen to match
	 * a statement line rather than a screen and a phone.
	 *
	 * Offered only after the gift is recorded and only on the bank-transfer
	 * path: a card donation through a campaign link already has the platform's
	 * own receipt, and asking for a second one would suggest the card payment
	 * had not gone through.
	 *
	 * Addressed by reference code, because the donor has no account and the
	 * reference is the only thing they hold. References are sequential, so a
	 * guessed one is a real one — which is why this attaches a picture and
	 * nothing else. It cannot move money, change an amount or reconcile a gift;
	 * the worst a guesser achieves is putting a wrong screenshot in front of
	 * finance, who are matching against a bank statement either way. The upload
	 * is refused once a receipt is attached or the gift has been confirmed, so
	 * it cannot be used to paper over a completed match, and `/donate` is
	 * already behind `PUBLIC_FORM_POLICY` in `hooks.server.ts`.
	 */
	uploadReceipt: async (event) => {
		const body = await event.request.formData();
		const reference = String(body.get('reference') ?? '')
			.trim()
			.toUpperCase();
		const file = body.get('receipt');

		if (!REFERENCE_PATTERN.test(reference)) {
			return fail(400, { receiptError: 'That reference does not look right.' });
		}
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { receiptError: 'Choose a photo or PDF of your transfer.' });
		}

		const [donation] = await db
			.select({
				id: donations.id,
				status: donations.status,
				receiptFileId: donations.receiptFileId
			})
			.from(donations)
			.where(and(eq(donations.referenceCode, reference), isNull(donations.deletedAt)))
			.limit(1);

		// One answer for "no such gift" and "already has one": neither tells a
		// guesser whether the reference they tried exists.
		if (
			!donation ||
			donation.receiptFileId ||
			!['pending_reconciliation', 'pledged'].includes(donation.status)
		) {
			return fail(422, {
				receiptError: 'We cannot attach a receipt to that gift. Please contact us instead.'
			});
		}

		try {
			// Private, and belonging to no pillar: this is a bank document, not case
			// data. `/files/[name]` lets `donations.read` open it.
			const saved = await saveUploadedFile(file, {
				isPublic: false,
				uploadedBy: event.locals.user?.id ?? null
			});

			// Conditional on the receipt still being unset, so two taps on a slow
			// connection cannot leave the first upload orphaned on the row.
			const updated = await db
				.update(donations)
				.set({ receiptFileId: saved.id, updatedAt: new Date() })
				.where(and(eq(donations.id, donation.id), isNull(donations.receiptFileId)))
				.returning({ id: donations.id });

			if (updated.length === 0) {
				await deleteStoredFile(saved.id);
				return fail(422, { receiptError: 'A receipt is already attached to that gift.' });
			}

			audit({
				event,
				action: 'updated',
				entityType: 'donation',
				entityId: donation.id,
				metadata: { reference, receiptFileId: saved.id }
			});

			return { receiptUploaded: true };
		} catch (err) {
			console.error('Receipt upload failed:', err);
			return fail(400, {
				receiptError:
					err instanceof Error && err.message.includes('not accepted')
						? err.message
						: 'We could not save that file. A photo or PDF under 10 MB works best.'
			});
		}
	},

	/**
	 * An offer of goods rather than money.
	 *
	 * Nothing here is accepted on the spot: the row lands at `offered` and a
	 * coordinator rings back. That is the honest answer — we cannot take four
	 * hundred coats we have nowhere to store, and telling somebody "thank you,
	 * this is confirmed" before anyone has looked would be a promise the
	 * Foundation cannot always keep.
	 */
	giftInKind: async (event) => {
		// Read once: the photos come off the same body as the fields, and
		// `event.request` can only be consumed one time.
		const body = await event.request.formData();
		const form = await superValidate(body, zod4(inKindSchema), { id: 'in-kind' });

		if (!form.valid) {
			return message(
				form,
				{ type: 'error', text: 'Please check the highlighted fields' },
				{ status: 400 }
			);
		}

		if (form.data.website) {
			// Honeypot — accepted silently, stored nowhere.
			return message(form, { type: 'success', text: 'Thank you.' });
		}

		const data = form.data;
		const trim = (value: string | null | undefined) => value?.trim() || null;

		// Superforms does not carry a repeated file input through the schema, so
		// the photos are read straight off the body.
		const photos = body
			.getAll('photos')
			.filter((entry): entry is File => entry instanceof File && entry.size > 0)
			.slice(0, 8);

		try {
			const email = trim(data.donorEmail)?.toLowerCase() ?? null;

			const result = await createInKindOffer(event, {
				donorName: data.donorName,
				donorEmail: email,
				donorPhone: trim(data.donorPhone),
				donorType: data.donorType,
				organisationName: trim(data.organisationName),
				isDiaspora: data.isDiaspora,
				preferredContactChannel: data.preferredContactChannel,
				bestTimeToContact: trim(data.bestTimeToContact),

				designationType: data.designationType,
				designationPillarId: data.designationPillarId ?? null,
				designationInitiativeId: data.designationInitiativeId ?? null,
				regionId: data.regionId,

				handoverMethod: data.handoverMethod,
				pickupContactName: trim(data.pickupContactName),
				pickupContactPhone: trim(data.pickupContactPhone),
				pickupAddressLine: trim(data.pickupAddressLine),
				pickupCity: trim(data.pickupCity),
				pickupLandmark: trim(data.pickupLandmark),
				accessNotes: trim(data.accessNotes),
				loadSize: data.loadSize,
				estimatedWeightKg: data.estimatedWeightKg,
				requiresVehicle: data.requiresVehicle,
				requiresHelpLoading: data.requiresHelpLoading,
				availableFrom: trim(data.availableFrom),
				availableUntil: trim(data.availableUntil),

				hasRestrictedItems: data.hasRestrictedItems,
				restrictedItemsNote: trim(data.restrictedItemsNote),
				valuationBasis: data.valuationBasis,

				receiptRequested: data.receiptRequested,
				taxReceiptRequired: data.taxReceiptRequired,
				taxIdNumber: trim(data.taxIdNumber),
				isAnonymous: data.isAnonymous,
				recognitionName: trim(data.recognitionName),
				donorMessage: trim(data.donorMessage),
				heardAbout: trim(data.heardAbout),
				consentToContact: data.consentToContact,

				items: data.items.map((item) => ({
					categoryId: item.categoryId,
					description: item.description,
					quantity: item.quantity,
					unit: item.unit,
					condition: item.condition,
					ageGroup: item.ageGroup,
					gender: item.gender,
					sizeRange: trim(item.sizeRange),
					brandOrModel: trim(item.brandOrModel),
					isPerishable: item.isPerishable,
					expiresOn: trim(item.expiresOn),
					needsRefrigeration: item.needsRefrigeration,
					estimatedValue: item.estimatedValue,
					notes: trim(item.notes)
				})),
				photos,
				userId: event.locals.user?.id ?? null
			});

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

			// Both sends are non-blocking: the offer is already recorded, and a
			// slow mail server must not turn it into an error page.
			if (email) {
				const mail = inKindOfferTemplate(data.donorName, result.referenceCode, result.summary);
				void sendEmail({ to: email, ...mail }).catch((err) =>
					console.error('in-kind email failed', err)
				);
			}
			void notifyNewInKindOffer(result).catch((err) =>
				console.error('in-kind notification failed', err)
			);

			return message(form, {
				type: 'success',
				text: 'Thank you. We have your offer and will call to arrange the handover.',
				reference: result.referenceCode,
				amount: result.summary
			});
		} catch (err) {
			console.error('In-kind offer failed:', err);
			return message(
				form,
				{ type: 'error', text: 'We could not record your offer. Please try again.' },
				{ status: 500 }
			);
		}
	}
};
