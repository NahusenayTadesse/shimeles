import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { error, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	futureInitiatives,
	inKindCategories,
	inKindDonationItems,
	inKindDonationPhotos,
	inKindDonations,
	pillars,
	regions
} from '$lib/server/db/schema';
import { upsertDonor } from '$lib/server/donors';
import { nextInKindReference } from '$lib/server/reference';
import { saveUploadedFile } from '$lib/server/upload';
import { audit } from '$lib/server/audit';
import { cached, invalidate } from '$lib/server/cache';
import { IN_KIND_STATUS_LABELS, type InKindCategoryOption, type ItemCondition } from '$lib/inKind';

/**
 * Giving goods instead of money.
 *
 * A gift of clothing is not a small donation, it is a different transaction:
 * it has to be described, judged, collected, counted and stored before it
 * helps anybody, and it can be declined — which a bank transfer cannot. So it
 * lives in `in_kind_donations` rather than as a nullable amount on
 * `donations`, and this module is the whole of the public write path.
 *
 * Two rules run through it.
 *
 *  - **An offer is an offer, not an acceptance.** Every row starts at
 *    `offered`. Nothing is promised to the donor here beyond that somebody
 *    will call; the coordinator decides whether the Foundation can take it.
 *  - **`estimatedValue` is never money.** It is the donor's own guess, kept
 *    for the annual report and the receipt. The public funds-raised figure
 *    sums completed `donations` and never looks at this table.
 */

/* ==========================================================================
   Catalogue
   ========================================================================== */

/**
 * What the Foundation will take, in the order the form should offer it.
 *
 * Categories that are paused (`isAcceptingNow: false`) are returned rather
 * than filtered out: the form shows them greyed with their `acceptanceNote`,
 * which stops somebody driving across the city with a load we cannot store.
 */
export async function getInKindCategories(): Promise<InKindCategoryOption[]> {
	return cached('in-kind-categories', async () => {
		const rows = await db
			.select()
			.from(inKindCategories)
			.where(and(eq(inKindCategories.isActive, true), isNull(inKindCategories.deletedAt)))
			.orderBy(asc(inKindCategories.sortOrder), asc(inKindCategories.id));

		return rows.map((row) => ({
			id: row.id,
			slug: row.slug,
			name: row.name,
			description: row.description,
			icon: row.icon,
			pillarId: row.pillarId,
			defaultUnit: row.defaultUnit,
			requiresExpiry: row.requiresExpiry,
			requiresSizing: row.requiresSizing,
			requiresTransport: row.requiresTransport,
			acceptanceNote: row.acceptanceNote,
			isAcceptingNow: row.isAcceptingNow
		}));
	});
}

/** Called by the dashboard after a category is edited. */
export const invalidateInKindCategories = () => invalidate('in-kind-categories');

/* ==========================================================================
   Recording an offer
   ========================================================================== */

export type InKindItemInput = {
	categoryId: number | null;
	description: string;
	quantity: number;
	unit: string;
	/** Derived from `ITEM_CONDITIONS`, so adding one there is the only edit. */
	condition: ItemCondition;
	ageGroup: 'any' | 'infant' | 'child' | 'teen' | 'adult' | 'elderly';
	gender: 'unisex' | 'female' | 'male';
	sizeRange: string | null;
	brandOrModel: string | null;
	isPerishable: boolean;
	expiresOn: string | null;
	needsRefrigeration: boolean;
	/** Birr as the donor typed it; converted to minor units here. */
	estimatedValue: number | null;
	notes: string | null;
};

export type InKindOfferInput = {
	donorName: string;
	donorEmail: string | null;
	donorPhone: string | null;
	donorType: (typeof inKindDonations.$inferInsert)['donorType'];
	organisationName: string | null;
	isDiaspora: boolean;
	preferredContactChannel: (typeof inKindDonations.$inferInsert)['preferredContactChannel'];
	bestTimeToContact: string | null;

	designationType: 'general_fund' | 'pillar' | 'future_initiative';
	designationPillarId: number | null;
	designationInitiativeId: number | null;
	regionId: number | null;

	handoverMethod: (typeof inKindDonations.$inferInsert)['handoverMethod'];
	pickupContactName: string | null;
	pickupContactPhone: string | null;
	pickupAddressLine: string | null;
	pickupCity: string | null;
	pickupLandmark: string | null;
	accessNotes: string | null;
	loadSize: (typeof inKindDonations.$inferInsert)['loadSize'];
	estimatedWeightKg: number | null;
	requiresVehicle: boolean;
	requiresHelpLoading: boolean;
	availableFrom: string | null;
	availableUntil: string | null;

	hasRestrictedItems: boolean;
	restrictedItemsNote: string | null;
	valuationBasis: (typeof inKindDonations.$inferInsert)['valuationBasis'];

	receiptRequested: boolean;
	taxReceiptRequired: boolean;
	taxIdNumber: string | null;
	isAnonymous: boolean;
	recognitionName: string | null;
	donorMessage: string | null;
	heardAbout: string | null;
	consentToContact: boolean;

	items: InKindItemInput[];
	photos: File[];
	userId: string | null;
};

export type InKindOfferResult = {
	id: number;
	referenceCode: string;
	summary: string;
	itemCount: number;
	totalQuantity: number;
};

/** Birr to santim. Blank stays blank rather than becoming a confident zero. */
const minorUnits = (value: number | null) => (value === null ? null : Math.round(value * 100));

/**
 * "3 boxes of children's coats and 2 more kinds of thing" — what a queue row
 * shows. Built here rather than in a view so every screen shows the same words
 * and no list query has to join the item rows to say anything at all.
 */
function summarise(items: InKindItemInput[]): string {
	if (items.length === 0) return 'An offer of goods';

	const [first] = items;
	const head = `${first.quantity} ${first.unit} of ${first.description}`.trim();
	const rest = items.length - 1;

	const summary = rest > 0 ? `${head} and ${rest} other ${rest === 1 ? 'item' : 'items'}` : head;
	return summary.slice(0, 240);
}

/**
 * Records an offer of goods and everything needed to go and collect them.
 *
 * The header and its items are written in one transaction — an offer with no
 * lines is not an offer, and half of one is worse than none. Photos are saved
 * afterwards, for the same reason `/apply` saves its documents afterwards: a
 * failed upload must not lose an offer that is otherwise complete.
 */
export async function createInKindOffer(
	event: RequestEvent,
	input: InKindOfferInput
): Promise<InKindOfferResult> {
	// The designation and the region are re-read rather than trusted: a browser
	// does not get to credit a gift to a pillar that does not exist.
	const categoryIds = [...new Set(input.items.map((item) => item.categoryId).filter(Boolean))];

	const [validPillar, validInitiative, validRegion, defaultRegion, validCategories] =
		await Promise.all([
			input.designationType === 'pillar' && input.designationPillarId
				? db
						.select({ id: pillars.id })
						.from(pillars)
						.where(and(eq(pillars.id, input.designationPillarId), isNull(pillars.deletedAt)))
						.limit(1)
				: [],
			input.designationType === 'future_initiative' && input.designationInitiativeId
				? db
						.select({ id: futureInitiatives.id })
						.from(futureInitiatives)
						.where(
							and(
								eq(futureInitiatives.id, input.designationInitiativeId),
								isNull(futureInitiatives.deletedAt)
							)
						)
						.limit(1)
				: [],
			input.regionId
				? db
						.select({ id: regions.id })
						.from(regions)
						.where(and(eq(regions.id, input.regionId), isNull(regions.deletedAt)))
						.limit(1)
				: [],
			db
				.select({ id: regions.id })
				.from(regions)
				.where(and(eq(regions.isDefault, true), isNull(regions.deletedAt)))
				.limit(1),
			categoryIds.length
				? db
						.select({ id: inKindCategories.id, pillarId: inKindCategories.pillarId })
						.from(inKindCategories)
						.where(
							and(
								inArray(inKindCategories.id, categoryIds as number[]),
								eq(inKindCategories.isActive, true),
								isNull(inKindCategories.deletedAt)
							)
						)
				: []
		]);

	const knownCategories = new Map(validCategories.map((row) => [row.id, row]));

	// An unknown category becomes "uncategorised" rather than a dangling
	// reference; the description the donor wrote still says what the thing is.
	const items = input.items.map((item) => ({
		...item,
		categoryId: item.categoryId && knownCategories.has(item.categoryId) ? item.categoryId : null
	}));

	const pillarId = validPillar[0]?.id ?? null;
	const initiativeId = validInitiative[0]?.id ?? null;

	// Same fallback as a cash gift: a designation we cannot confirm is the
	// general fund, never a broken pointer.
	const designationType = pillarId ? 'pillar' : initiativeId ? 'future_initiative' : 'general_fund';

	const regionId = validRegion[0]?.id ?? defaultRegion[0]?.id ?? null;

	const donorId = await upsertDonor({
		fullName: input.donorName,
		email: input.donorEmail,
		phone: input.donorPhone,
		// The offer already asks who the goods are from; carrying it onto the
		// donor row is what makes "this company gave twice" one supporter.
		organisationName: input.organisationName,
		isDiaspora: input.isDiaspora,
		userId: input.userId
	});

	const referenceCode = nextInKindReference();
	const now = new Date();

	const summary = summarise(items);
	const totalQuantity = items.reduce((total, item) => total + item.quantity, 0);

	// Rolled up from the lines so the collection queue can flag "this one
	// cannot wait" without reading them.
	const isPerishable = items.some((item) => item.isPerishable || Boolean(item.expiresOn));
	const needsColdStorage = items.some((item) => item.needsRefrigeration);

	const itemValues = items.map((item) => minorUnits(item.estimatedValue)).filter((v) => v !== null);
	const estimatedValue = itemValues.length
		? itemValues.reduce((total, value) => total + (value as number), 0)
		: null;

	const offerId = db.transaction((tx) => {
		const [offer] = tx
			.insert(inKindDonations)
			.values({
				referenceCode,
				donorId,
				donorName: input.donorName,
				donorEmail: input.donorEmail,
				donorPhone: input.donorPhone,
				donorType: input.donorType,
				organisationName: input.organisationName,
				isDiaspora: input.isDiaspora,
				preferredContactChannel: input.preferredContactChannel,
				bestTimeToContact: input.bestTimeToContact,

				summary,
				itemCount: items.length,
				totalQuantity,
				estimatedValue,
				valuationBasis: input.valuationBasis,
				isPerishable,
				needsColdStorage,
				hasRestrictedItems: input.hasRestrictedItems,
				restrictedItemsNote: input.restrictedItemsNote,

				designationType,
				designationPillarId: pillarId,
				designationInitiativeId: initiativeId,
				regionId,

				handoverMethod: input.handoverMethod,
				// Collection details are only meaningful for a collection; storing a
				// home address against a drop-off keeps data nobody will ever use.
				pickupContactName: input.handoverMethod === 'pickup' ? input.pickupContactName : null,
				pickupContactPhone: input.handoverMethod === 'pickup' ? input.pickupContactPhone : null,
				pickupAddressLine: input.handoverMethod === 'pickup' ? input.pickupAddressLine : null,
				pickupCity: input.handoverMethod === 'pickup' ? input.pickupCity : null,
				pickupLandmark: input.handoverMethod === 'pickup' ? input.pickupLandmark : null,
				accessNotes: input.handoverMethod === 'pickup' ? input.accessNotes : null,
				loadSize: input.loadSize,
				estimatedWeightKg: input.estimatedWeightKg,
				requiresVehicle: input.requiresVehicle,
				requiresHelpLoading: input.requiresHelpLoading,
				availableFrom: input.availableFrom,
				availableUntil: input.availableUntil,

				receiptRequested: input.receiptRequested,
				taxReceiptRequired: input.taxReceiptRequired,
				taxIdNumber: input.taxIdNumber,
				isAnonymous: input.isAnonymous,
				recognitionName: input.recognitionName,
				donorMessage: input.donorMessage,
				heardAbout: input.heardAbout,
				// Stamped from the server clock, never from anything posted.
				consentToContactAt: input.consentToContact ? now : null,

				status: 'offered',
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: inKindDonations.id })
			.all();

		const id = offer.id;

		tx.insert(inKindDonationItems)
			.values(
				items.map((item, index) => ({
					inKindDonationId: id,
					categoryId: item.categoryId,
					description: item.description,
					quantity: item.quantity,
					unit: item.unit,
					condition: item.condition,
					ageGroup: item.ageGroup,
					gender: item.gender,
					sizeRange: item.sizeRange,
					brandOrModel: item.brandOrModel,
					isPerishable: item.isPerishable || Boolean(item.expiresOn),
					expiresOn: item.expiresOn,
					needsRefrigeration: item.needsRefrigeration,
					estimatedValue: minorUnits(item.estimatedValue),
					notes: item.notes,
					sortOrder: index,
					createdAt: now,
					updatedAt: now
				}))
			)
			.run();

		return id;
	});

	// Photos land after the commit. They are of the inside of someone's home,
	// so they are private files like a case document, not public media.
	for (const file of input.photos) {
		if (!file || file.size === 0) continue;
		try {
			const saved = await saveUploadedFile(file, { isPublic: false, pillarId });
			await db.insert(inKindDonationPhotos).values({
				inKindDonationId: offerId,
				fileId: saved.id,
				caption: file.name,
				source: 'donor'
			});
		} catch (err) {
			console.error('in-kind photo failed', err);
		}
	}

	audit({
		event,
		action: 'created',
		entityType: 'in_kind_donation',
		entityId: offerId,
		metadata: {
			reference: referenceCode,
			items: items.length,
			handoverMethod: input.handoverMethod,
			designationType
		}
	});

	return { id: offerId, referenceCode, summary, itemCount: items.length, totalQuantity };
}

/* ==========================================================================
   Working the queue
   ========================================================================== */

export type InKindStatus = (typeof inKindDonations.$inferSelect)['status'];

/**
 * Which moves are legal, and from where.
 *
 * This is the control, not the dashboard's button states — the detail screen
 * hides what it cannot do as a courtesy, and `setInKindStatus` refuses the
 * same moves regardless of what is posted. Two rules are worth stating:
 *
 *  - **Nothing is `received` that was never accepted.** Goods appearing in the
 *    store room without a decision behind them is exactly how a foundation
 *    ends up storing what it cannot use.
 *  - **`distributed` follows `received`.** Handing on goods the Foundation
 *    never took in is not a thing that can have happened.
 *
 * The terminal states still allow one step back to `under_review`, because the
 * commonest mistake on a queue is a mis-click, and a decline that cannot be
 * undone gets worked around with a second row instead.
 */
const TRANSITIONS: Record<InKindStatus, InKindStatus[]> = {
	offered: ['under_review', 'accepted', 'declined', 'cancelled'],
	under_review: ['accepted', 'declined', 'cancelled'],
	accepted: ['scheduled', 'received', 'declined', 'cancelled'],
	// Re-booking is a move from `scheduled` to itself: donors postpone, vans
	// break down, and the alternative is a coordinator cancelling a collection
	// to change its date.
	scheduled: ['scheduled', 'received', 'accepted', 'cancelled'],
	received: ['distributed'],
	distributed: [],
	declined: ['under_review'],
	cancelled: ['under_review']
};

export const canMoveInKind = (from: InKindStatus, to: InKindStatus) =>
	TRANSITIONS[from]?.includes(to) ?? false;

export type InKindStatusChange = {
	id: number;
	to: InKindStatus;
	userId: string | null;
	/** Recorded against whichever column the move is about. */
	reviewNotes?: string | null;
	declineReason?: string | null;
	intakeNotes?: string | null;
	distributionNotes?: string | null;
	scheduledFor?: string | null;
	scheduledWindow?: string | null;
};

/**
 * Moves one offer along, stamping whoever did it and when.
 *
 * Returns the row as it was before the move so the caller can tell the donor
 * what changed — and so the audit line says what it moved *from*, which is the
 * half of a status change that gets lost otherwise.
 */
export async function setInKindStatus(
	event: RequestEvent,
	change: InKindStatusChange
): Promise<{ previous: InKindStatus; referenceCode: string } | null> {
	const [offer] = await db
		.select({
			id: inKindDonations.id,
			status: inKindDonations.status,
			referenceCode: inKindDonations.referenceCode
		})
		.from(inKindDonations)
		.where(and(eq(inKindDonations.id, change.id), isNull(inKindDonations.deletedAt)))
		.limit(1);

	if (!offer) return null;
	if (!canMoveInKind(offer.status, change.to)) {
		throw error(
			422,
			`An offer marked "${IN_KIND_STATUS_LABELS[offer.status]}" cannot be moved to "${IN_KIND_STATUS_LABELS[change.to]}".`
		);
	}

	const now = new Date();
	const values: Partial<typeof inKindDonations.$inferInsert> = {
		status: change.to,
		updatedAt: now
	};

	// Every decision gets a reviewer and a timestamp, so "who said yes to this"
	// is answerable months later without reading the audit log.
	if (change.to === 'accepted' || change.to === 'declined' || change.to === 'under_review') {
		values.reviewedById = change.userId;
		values.reviewedAt = now;
	}
	if (change.reviewNotes !== undefined) values.reviewNotes = change.reviewNotes;
	if (change.declineReason !== undefined) values.declineReason = change.declineReason;
	if (change.intakeNotes !== undefined) values.intakeNotes = change.intakeNotes;
	if (change.distributionNotes !== undefined) values.distributionNotes = change.distributionNotes;
	if (change.scheduledFor !== undefined) values.scheduledFor = change.scheduledFor;
	if (change.scheduledWindow !== undefined) values.scheduledWindow = change.scheduledWindow;

	if (change.to === 'received') {
		values.receivedAt = now;
		values.receivedById = change.userId;
	}

	await db.update(inKindDonations).set(values).where(eq(inKindDonations.id, change.id));

	audit({
		event,
		action: 'updated_status',
		entityType: 'in_kind_donation',
		entityId: change.id,
		metadata: { from: offer.status, to: change.to, reference: offer.referenceCode }
	});

	return { previous: offer.status, referenceCode: offer.referenceCode };
}

/**
 * Records what actually turned up, line by line, and takes the offer in.
 *
 * A line left blank at intake is taken as "all of it arrived" rather than
 * "none of it did": the common case is that the boxes match the offer, and
 * making a coordinator retype twelve numbers to say so is how intake stops
 * being done at all. A zero is still a zero — that is the way to say a line
 * never came.
 */
export async function recordInKindIntake(
	event: RequestEvent,
	input: {
		id: number;
		userId: string | null;
		intakeNotes: string | null;
		lines: { itemId: number; acceptedQuantity: number | null; intakeNote: string | null }[];
	}
): Promise<{ previous: InKindStatus; referenceCode: string } | null> {
	const items = await db
		.select({ id: inKindDonationItems.id, quantity: inKindDonationItems.quantity })
		.from(inKindDonationItems)
		.where(eq(inKindDonationItems.inKindDonationId, input.id));

	const known = new Map(items.map((item) => [item.id, item]));
	const now = new Date();

	const result = await setInKindStatus(event, {
		id: input.id,
		to: 'received',
		userId: input.userId,
		intakeNotes: input.intakeNotes
	});

	if (!result) return null;

	for (const line of input.lines) {
		const item = known.get(line.itemId);
		if (!item) continue;

		await db
			.update(inKindDonationItems)
			.set({
				acceptedQuantity: line.acceptedQuantity ?? item.quantity,
				intakeNote: line.intakeNote,
				updatedAt: now
			})
			.where(eq(inKindDonationItems.id, line.itemId));
	}

	return result;
}
