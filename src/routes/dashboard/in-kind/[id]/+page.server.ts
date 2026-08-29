import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	donors,
	files,
	futureInitiatives,
	inKindCategories,
	inKindDonationItems,
	inKindDonationPhotos,
	inKindDonations,
	pillars,
	regions,
	user
} from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { canMoveInKind, recordInKindIntake, setInKindStatus } from '$lib/server/inKind';
import { audit } from '$lib/server/audit';
import { sendEmail, inKindDecisionTemplate } from '$lib/server/email';
import { normalizeRichText } from '$lib/richtext';
import type { Actions, PageServerLoad } from './$types';

/**
 * One offer of goods, and everything that happens to it.
 *
 * The screen is built around the sequence a coordinator actually works
 * through — read what it is, decide, book the collection, count what turned
 * up, record where it went — and each step is its own action rather than a
 * status dropdown, because "accepted" and "received" mean different work and
 * need different information alongside them.
 *
 * The transition rules live in `$lib/server/inKind`, not here. This route
 * hides the controls it cannot use; `setInKindStatus` refuses the same moves
 * whatever gets posted.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'inkind.read');

	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(404, 'Not found');

	const [offer] = await db
		.select({
			id: inKindDonations.id,
			reference: inKindDonations.referenceCode,
			summary: inKindDonations.summary,
			status: inKindDonations.status,
			itemCount: inKindDonations.itemCount,
			totalQuantity: inKindDonations.totalQuantity,
			estimatedValue: inKindDonations.estimatedValue,
			currency: inKindDonations.currency,
			valuationBasis: inKindDonations.valuationBasis,
			isPerishable: inKindDonations.isPerishable,
			needsColdStorage: inKindDonations.needsColdStorage,
			hasRestrictedItems: inKindDonations.hasRestrictedItems,
			restrictedItemsNote: inKindDonations.restrictedItemsNote,

			donorId: inKindDonations.donorId,
			donorName: inKindDonations.donorName,
			donorEmail: inKindDonations.donorEmail,
			donorPhone: inKindDonations.donorPhone,
			donorType: inKindDonations.donorType,
			organisationName: inKindDonations.organisationName,
			isDiaspora: inKindDonations.isDiaspora,
			preferredContactChannel: inKindDonations.preferredContactChannel,
			bestTimeToContact: inKindDonations.bestTimeToContact,
			isAnonymous: inKindDonations.isAnonymous,
			recognitionName: inKindDonations.recognitionName,
			donorMessage: inKindDonations.donorMessage,
			heardAbout: inKindDonations.heardAbout,
			consentToContactAt: inKindDonations.consentToContactAt,
			receiptRequested: inKindDonations.receiptRequested,
			taxReceiptRequired: inKindDonations.taxReceiptRequired,
			taxIdNumber: inKindDonations.taxIdNumber,

			designationType: inKindDonations.designationType,
			handoverMethod: inKindDonations.handoverMethod,
			pickupContactName: inKindDonations.pickupContactName,
			pickupContactPhone: inKindDonations.pickupContactPhone,
			pickupAddressLine: inKindDonations.pickupAddressLine,
			pickupCity: inKindDonations.pickupCity,
			pickupLandmark: inKindDonations.pickupLandmark,
			accessNotes: inKindDonations.accessNotes,
			loadSize: inKindDonations.loadSize,
			estimatedWeightKg: inKindDonations.estimatedWeightKg,
			requiresVehicle: inKindDonations.requiresVehicle,
			requiresHelpLoading: inKindDonations.requiresHelpLoading,
			availableFrom: inKindDonations.availableFrom,
			availableUntil: inKindDonations.availableUntil,

			reviewedAt: inKindDonations.reviewedAt,
			reviewNotes: inKindDonations.reviewNotes,
			declineReason: inKindDonations.declineReason,
			assignedToId: inKindDonations.assignedToId,
			scheduledFor: inKindDonations.scheduledFor,
			scheduledWindow: inKindDonations.scheduledWindow,
			receivedAt: inKindDonations.receivedAt,
			intakeNotes: inKindDonations.intakeNotes,
			distributionNotes: inKindDonations.distributionNotes,
			acknowledgementSentAt: inKindDonations.acknowledgementSentAt,
			isRead: inKindDonations.isRead,
			createdAt: inKindDonations.createdAt,
			/** Stands in for a `distributedAt`: the closing note is the last write. */
			updatedAt: inKindDonations.updatedAt,

			pillarName: pillars.name,
			initiativeName: futureInitiatives.name,
			regionName: regions.name,
			assigneeName: user.name,
			donorLifetimeTotal: donors.lifetimeTotal,
			donorDonationCount: donors.donationCount
		})
		.from(inKindDonations)
		.leftJoin(pillars, eq(pillars.id, inKindDonations.designationPillarId))
		.leftJoin(futureInitiatives, eq(futureInitiatives.id, inKindDonations.designationInitiativeId))
		.leftJoin(regions, eq(regions.id, inKindDonations.regionId))
		.leftJoin(user, eq(user.id, inKindDonations.assignedToId))
		.leftJoin(donors, eq(donors.id, inKindDonations.donorId))
		.where(and(eq(inKindDonations.id, id), isNull(inKindDonations.deletedAt)))
		.limit(1);

	if (!offer) throw error(404, 'That offer no longer exists.');

	const [items, photos, reviewer, receiver, staff] = await Promise.all([
		db
			.select({
				id: inKindDonationItems.id,
				description: inKindDonationItems.description,
				quantity: inKindDonationItems.quantity,
				unit: inKindDonationItems.unit,
				condition: inKindDonationItems.condition,
				ageGroup: inKindDonationItems.ageGroup,
				gender: inKindDonationItems.gender,
				sizeRange: inKindDonationItems.sizeRange,
				brandOrModel: inKindDonationItems.brandOrModel,
				isPerishable: inKindDonationItems.isPerishable,
				expiresOn: inKindDonationItems.expiresOn,
				needsRefrigeration: inKindDonationItems.needsRefrigeration,
				estimatedValue: inKindDonationItems.estimatedValue,
				currency: inKindDonationItems.currency,
				notes: inKindDonationItems.notes,
				acceptedQuantity: inKindDonationItems.acceptedQuantity,
				intakeNote: inKindDonationItems.intakeNote,
				categoryName: inKindCategories.name,
				categoryIcon: inKindCategories.icon,
				acceptanceNote: inKindCategories.acceptanceNote,
				categoryAcceptingNow: inKindCategories.isAcceptingNow
			})
			.from(inKindDonationItems)
			.leftJoin(inKindCategories, eq(inKindCategories.id, inKindDonationItems.categoryId))
			.where(
				and(eq(inKindDonationItems.inKindDonationId, id), isNull(inKindDonationItems.deletedAt))
			)
			.orderBy(asc(inKindDonationItems.sortOrder), asc(inKindDonationItems.id)),

		db
			.select({
				id: inKindDonationPhotos.id,
				caption: inKindDonationPhotos.caption,
				source: inKindDonationPhotos.source,
				storagePath: files.storagePath,
				mimeType: files.mimeType,
				sizeBytes: files.sizeBytes
			})
			.from(inKindDonationPhotos)
			.innerJoin(files, eq(files.id, inKindDonationPhotos.fileId))
			.where(
				and(eq(inKindDonationPhotos.inKindDonationId, id), isNull(inKindDonationPhotos.deletedAt))
			)
			.orderBy(asc(inKindDonationPhotos.id)),

		offer.status === 'offered'
			? []
			: db
					.select({ name: user.name })
					.from(inKindDonations)
					.innerJoin(user, eq(user.id, inKindDonations.reviewedById))
					.where(eq(inKindDonations.id, id))
					.limit(1),

		db
			.select({ name: user.name })
			.from(inKindDonations)
			.innerJoin(user, eq(user.id, inKindDonations.receivedById))
			.where(eq(inKindDonations.id, id))
			.limit(1),

		// Who a collection can be handed to. Every dashboard user is a candidate:
		// driving to Bole for four boxes is not a permission-shaped job.
		//
		// `banned` is null for an account that has never been suspended and
		// *false* for one that was suspended and reinstated, so the test has to
		// admit both — an `isNull` alone quietly hides everyone ever unbanned.
		db
			.select({ id: user.id, name: user.name })
			.from(user)
			.where(or(isNull(user.banned), eq(user.banned, false)))
			.orderBy(asc(user.name))
	]);

	// Opening an offer is what marks it answered-for; the queue's "unopened"
	// badge is only honest if reading it clears the flag.
	if (!offer.isRead) {
		await db.update(inKindDonations).set({ isRead: true }).where(eq(inKindDonations.id, id));
	}

	audit({
		event,
		action: 'viewed',
		entityType: 'in_kind_donation',
		entityId: id,
		metadata: { reference: offer.reference }
	});

	return {
		/** Names this page in the breadcrumb above it. */
		crumb: [offer.reference, offer.summary].filter(Boolean).join(' · '),
		offer,
		items,
		photos,
		reviewerName: reviewer[0]?.name ?? null,
		receiverName: receiver[0]?.name ?? null,
		staff,
		/** What this offer may become next, so the screen only offers real moves. */
		canMove: {
			review: canMoveInKind(offer.status, 'under_review'),
			accept: canMoveInKind(offer.status, 'accepted'),
			decline: canMoveInKind(offer.status, 'declined'),
			schedule: canMoveInKind(offer.status, 'scheduled'),
			receive: canMoveInKind(offer.status, 'received'),
			distribute: canMoveInKind(offer.status, 'distributed'),
			cancel: canMoveInKind(offer.status, 'cancelled')
		}
	};
};

/** Every write on this screen needs the same two things. */
async function guard(event: RequestEvent) {
	const access = await requirePermission(event, 'inkind.write');
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(404, 'Not found');
	return { access, id };
}

/**
 * Tells the donor what was decided.
 *
 * Non-blocking and never fatal: the decision is already recorded, and a mail
 * server having a bad afternoon must not make a coordinator think the accept
 * did not happen. A failed send is logged and reported as a partial success,
 * so somebody can pick up the phone instead.
 */
async function notifyDonor(input: {
	id: number;
	email: string | null;
	name: string;
	reference: string;
	summary: string;
	outcome: 'accepted' | 'declined' | 'scheduled' | 'received';
	note: string | null;
	when: string | null;
}): Promise<boolean> {
	if (!input.email) return false;

	const mail = inKindDecisionTemplate({
		name: input.name,
		referenceCode: input.reference,
		summary: input.summary,
		outcome: input.outcome,
		note: input.note,
		when: input.when
	});

	try {
		await sendEmail({ to: input.email, ...mail });
		await db
			.update(inKindDonations)
			.set({ acknowledgementSentAt: new Date() })
			.where(eq(inKindDonations.id, input.id));
		return true;
	} catch (err) {
		console.error('in-kind decision email failed', err);
		return false;
	}
}

/** The row fields every action needs to write a sensible email. */
async function offerFor(id: number) {
	const [row] = await db
		.select({
			id: inKindDonations.id,
			reference: inKindDonations.referenceCode,
			summary: inKindDonations.summary,
			donorName: inKindDonations.donorName,
			donorEmail: inKindDonations.donorEmail,
			status: inKindDonations.status
		})
		.from(inKindDonations)
		.where(and(eq(inKindDonations.id, id), isNull(inKindDonations.deletedAt)))
		.limit(1);
	return row ?? null;
}

export const actions: Actions = {
	/** Picks the offer up: somebody is now looking at it. */
	startReview: async (event) => {
		const { access, id } = await guard(event);
		const moved = await setInKindStatus(event, { id, to: 'under_review', userId: access.userId });
		if (!moved) return fail(404, { error: 'That offer no longer exists.' });
		return { ok: true };
	},

	/**
	 * Accept or decline.
	 *
	 * A decline needs a reason — not as validation theatre, but because the
	 * reason is what gets said to the person who offered, and "no" without one
	 * is the version of this that loses a donor for good.
	 */
	decide: async (event) => {
		const { access, id } = await guard(event);
		const formData = await event.request.formData();
		const outcome = String(formData.get('outcome'));
		const note = normalizeRichText(String(formData.get('note') ?? ''));
		const notify = formData.get('notify') === 'on';

		if (outcome !== 'accepted' && outcome !== 'declined') {
			return fail(400, { error: 'That is not a decision this screen can record.' });
		}
		if (outcome === 'declined' && !note) {
			return fail(400, { error: 'Please say why, so we can tell the donor something useful.' });
		}

		const before = await offerFor(id);
		if (!before) return fail(404, { error: 'That offer no longer exists.' });

		const moved = await setInKindStatus(event, {
			id,
			to: outcome,
			userId: access.userId,
			reviewNotes: outcome === 'accepted' ? note || null : undefined,
			declineReason: outcome === 'declined' ? note : undefined
		});
		if (!moved) return fail(404, { error: 'That offer no longer exists.' });

		const emailed = notify
			? await notifyDonor({
					id,
					email: before.donorEmail,
					name: before.donorName,
					reference: before.reference,
					summary: before.summary,
					outcome,
					note: note || null,
					when: null
				})
			: false;

		return { ok: true, emailed, notifyFailed: notify && !emailed && Boolean(before.donorEmail) };
	},

	/** Books the collection or the drop-off. */
	schedule: async (event) => {
		const { access, id } = await guard(event);
		const formData = await event.request.formData();
		const scheduledFor = String(formData.get('scheduledFor') ?? '').trim();
		const scheduledWindow = String(formData.get('scheduledWindow') ?? '').trim();
		const assignedToId = String(formData.get('assignedToId') ?? '').trim();
		const notify = formData.get('notify') === 'on';

		if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
			return fail(400, { error: 'Pick a date for the handover.' });
		}

		const before = await offerFor(id);
		if (!before) return fail(404, { error: 'That offer no longer exists.' });

		const moved = await setInKindStatus(event, {
			id,
			to: 'scheduled',
			userId: access.userId,
			scheduledFor,
			scheduledWindow: scheduledWindow || null
		});
		if (!moved) return fail(404, { error: 'That offer no longer exists.' });

		if (assignedToId) {
			await db
				.update(inKindDonations)
				.set({ assignedToId, updatedAt: new Date() })
				.where(eq(inKindDonations.id, id));
		}

		const emailed = notify
			? await notifyDonor({
					id,
					email: before.donorEmail,
					name: before.donorName,
					reference: before.reference,
					summary: before.summary,
					outcome: 'scheduled',
					note: scheduledWindow || null,
					when: scheduledFor
				})
			: false;

		return { ok: true, emailed, notifyFailed: notify && !emailed && Boolean(before.donorEmail) };
	},

	/**
	 * Counts the goods in.
	 *
	 * The per-line quantities are the point: what was offered and what arrived
	 * are different numbers often enough that recording only the offer makes
	 * the stock figures fiction.
	 */
	receive: async (event) => {
		const { access, id } = await guard(event);
		const formData = await event.request.formData();
		const intakeNotes = normalizeRichText(String(formData.get('intakeNotes') ?? ''));
		const notify = formData.get('notify') === 'on';

		const lines = formData
			.getAll('itemId')
			.map((raw) => Number(raw))
			.filter((itemId) => Number.isFinite(itemId))
			.map((itemId) => {
				const quantity = String(formData.get(`accepted-${itemId}`) ?? '').trim();
				const note = String(formData.get(`note-${itemId}`) ?? '').trim();
				return {
					itemId,
					// Blank means "all of it arrived"; `recordInKindIntake` fills it in
					// from the offered quantity. A zero is a real zero.
					acceptedQuantity: quantity === '' ? null : Math.max(0, Math.round(Number(quantity))),
					intakeNote: note || null
				};
			})
			.filter((line) => line.acceptedQuantity === null || Number.isFinite(line.acceptedQuantity));

		const before = await offerFor(id);
		if (!before) return fail(404, { error: 'That offer no longer exists.' });

		const moved = await recordInKindIntake(event, {
			id,
			userId: access.userId,
			intakeNotes: intakeNotes || null,
			lines
		});
		if (!moved) return fail(404, { error: 'That offer no longer exists.' });

		const emailed = notify
			? await notifyDonor({
					id,
					email: before.donorEmail,
					name: before.donorName,
					reference: before.reference,
					summary: before.summary,
					outcome: 'received',
					note: intakeNotes || null,
					when: null
				})
			: false;

		return { ok: true, emailed, notifyFailed: notify && !emailed && Boolean(before.donorEmail) };
	},

	/** Closes the offer: the goods have reached the people they were for. */
	distribute: async (event) => {
		const { access, id } = await guard(event);
		const formData = await event.request.formData();
		const notes = String(formData.get('distributionNotes') ?? '').trim();

		if (!notes) {
			return fail(400, { error: 'Please record where the goods went.' });
		}

		const moved = await setInKindStatus(event, {
			id,
			to: 'distributed',
			userId: access.userId,
			distributionNotes: notes
		});
		if (!moved) return fail(404, { error: 'That offer no longer exists.' });

		return { ok: true };
	},

	/** The donor changed their mind, or gave the goods elsewhere. */
	cancel: async (event) => {
		const { access, id } = await guard(event);
		const formData = await event.request.formData();
		const note = String(formData.get('note') ?? '').trim();

		const moved = await setInKindStatus(event, {
			id,
			to: 'cancelled',
			userId: access.userId,
			reviewNotes: note || null
		});
		if (!moved) return fail(404, { error: 'That offer no longer exists.' });

		return { ok: true };
	},

	/** Puts a declined or cancelled offer back in the queue after a mis-click. */
	reopen: async (event) => {
		const { access, id } = await guard(event);
		const moved = await setInKindStatus(event, { id, to: 'under_review', userId: access.userId });
		if (!moved) return fail(404, { error: 'That offer no longer exists.' });
		return { ok: true };
	},

	/** Hands the collection to somebody, without moving the offer along. */
	assign: async (event) => {
		const { id } = await guard(event);
		const formData = await event.request.formData();
		const assignedToId = String(formData.get('assignedToId') ?? '').trim() || null;

		await db
			.update(inKindDonations)
			.set({ assignedToId, updatedAt: new Date() })
			.where(eq(inKindDonations.id, id));

		audit({
			event,
			action: 'assigned',
			entityType: 'in_kind_donation',
			entityId: id,
			metadata: { assignedToId }
		});

		return { ok: true };
	}
};
