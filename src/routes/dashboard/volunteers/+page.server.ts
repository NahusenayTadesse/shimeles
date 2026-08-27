import { error, fail, isHttpError } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	pillars,
	regions,
	statusOptions,
	user,
	volunteerApplications,
	volunteerApplicationSkills,
	volunteerAvailability,
	volunteerCredentials,
	volunteerPlacements,
	volunteerProfessions,
	volunteerReferences,
	volunteerSafeguardingChecklistItems,
	volunteerSafeguardingChecks,
	volunteerSkills,
	volunteerTimeSlots
} from '$lib/server/db/schema';
import { searchFilter } from '$lib/server/query';
import { requirePermission } from '$lib/server/permissions';
import {
	canApproveVolunteer,
	listStatuses,
	recomputeSafeguarding,
	setVolunteerStatus
} from '$lib/server/workflow';
import { recomputeCredentials, recomputeReferences } from '$lib/server/volunteers';
import { audit, auditList } from '$lib/server/audit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * The volunteer list, and the whole approval workflow with it.
 *
 * Volunteers are not pillar-scoped the way cases are: a coordinator manages the
 * whole volunteer pipeline, and a volunteer's application contains no
 * beneficiary data. The permission (`volunteers.read`) is the whole gate.
 *
 * **Everything a coordinator does to a volunteer happens here**, in the row.
 * Status, the safeguarding checklist, licence verification, reference outcomes,
 * who is reviewing, placements — all of it. This is a small team working
 * through a queue, and a workflow that made them open a page, scroll to a
 * control and come back for the next person was costing more attention than
 * the decisions themselves. What is left on a volunteer's own page is composing
 * and sending their form, which is the one job a table row cannot hold.
 *
 * The controls moving into the table changes **nothing** about what is
 * enforced. `setVolunteerStatus` still refuses an approved stage while the
 * safeguarding checklist is incomplete, and still refuses it when this action
 * is posted to directly. The bulk version below calls that same function once
 * per volunteer for exactly this reason: a loop that wrote statuses itself
 * would be a second path to the thing §3.6 has only one path to.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'volunteers.read');

	const search = event.url.searchParams.get('q')?.trim() ?? '';
	const statusId = event.url.searchParams.get('status');
	const blocked = event.url.searchParams.get('blocked') === '1';
	const skillId = event.url.searchParams.get('skill');
	const slotId = event.url.searchParams.get('slot');
	const professional = event.url.searchParams.get('professional') === '1';

	const clauses: (SQL | undefined)[] = [isNull(volunteerApplications.deletedAt)];

	if (statusId) clauses.push(eq(volunteerApplications.statusId, Number(statusId)));
	// "Blocked" is the coordinator's real working queue: everyone who cannot be
	// approved yet because their safeguarding checklist is incomplete.
	if (blocked) clauses.push(eq(volunteerApplications.safeguardingChecklistComplete, false));
	if (professional) clauses.push(eq(volunteerApplications.isProfessional, true));

	// The question the catalogue tables exist to answer: who can do this, and
	// who is free then. Both are subqueries against the join tables rather than
	// a `LIKE` over free text (§3.6).
	if (skillId) {
		clauses.push(
			inArray(
				volunteerApplications.id,
				db
					.select({ id: volunteerApplicationSkills.volunteerApplicationId })
					.from(volunteerApplicationSkills)
					.where(eq(volunteerApplicationSkills.skillId, Number(skillId)))
			)
		);
	}

	if (slotId) {
		clauses.push(
			inArray(
				volunteerApplications.id,
				db
					.select({ id: volunteerAvailability.volunteerApplicationId })
					.from(volunteerAvailability)
					.where(eq(volunteerAvailability.timeSlotId, Number(slotId)))
			)
		);
	}
	const searchClause = searchFilter(search, [
		volunteerApplications.referenceNumber,
		volunteerApplications.fullName,
		volunteerApplications.email,
		volunteerApplications.phone
	]);
	if (searchClause) clauses.push(searchClause);

	const [rows, statuses, skillOptions, slotOptions, checklistItems, reviewers, pillarOptions] =
		await Promise.all([
			db
				.select({
					id: volunteerApplications.id,
					reference: volunteerApplications.referenceNumber,
					fullName: volunteerApplications.fullName,
					email: volunteerApplications.email,
					phone: volunteerApplications.phone,
					motivation: volunteerApplications.motivation,
					city: volunteerApplications.city,
					availability: volunteerApplications.availability,
					credentials: volunteerApplications.professionalCredentials,
					credentialsVerified: volunteerApplications.credentialsVerified,
					referencesChecked: volunteerApplications.referencesChecked,
					safeguardingComplete: volunteerApplications.safeguardingChecklistComplete,
					isProfessional: volunteerApplications.isProfessional,
					isRead: volunteerApplications.isRead,
					createdAt: volunteerApplications.createdAt,
					statusId: volunteerApplications.statusId,
					reviewerId: volunteerApplications.assignedReviewerId,
					statusLabel: statusOptions.label,
					statusColor: statusOptions.color,
					statusStage: statusOptions.stage,
					regionName: regions.name,
					reviewerName: user.name
				})
				.from(volunteerApplications)
				.leftJoin(statusOptions, eq(statusOptions.id, volunteerApplications.statusId))
				.leftJoin(regions, eq(regions.id, volunteerApplications.regionId))
				.leftJoin(user, eq(user.id, volunteerApplications.assignedReviewerId))
				.where(and(...(clauses.filter(Boolean) as SQL[])))
				.orderBy(desc(volunteerApplications.createdAt))
				.limit(500),

			listStatuses('volunteer'),

			db
				.select({ id: volunteerSkills.id, name: volunteerSkills.name })
				.from(volunteerSkills)
				.where(and(eq(volunteerSkills.isActive, true), isNull(volunteerSkills.deletedAt)))
				.orderBy(asc(volunteerSkills.sortOrder), asc(volunteerSkills.id)),

			db
				.select({
					id: volunteerTimeSlots.id,
					label: volunteerTimeSlots.label,
					dayOfWeek: volunteerTimeSlots.dayOfWeek
				})
				.from(volunteerTimeSlots)
				.where(and(eq(volunteerTimeSlots.isActive, true), isNull(volunteerTimeSlots.deletedAt)))
				.orderBy(asc(volunteerTimeSlots.sortOrder), asc(volunteerTimeSlots.id)),

			db
				.select({
					id: volunteerSafeguardingChecklistItems.id,
					label: volunteerSafeguardingChecklistItems.label,
					description: volunteerSafeguardingChecklistItems.description,
					professionalOnly: volunteerSafeguardingChecklistItems.professionalOnly
				})
				.from(volunteerSafeguardingChecklistItems)
				.where(
					and(
						eq(volunteerSafeguardingChecklistItems.isActive, true),
						isNull(volunteerSafeguardingChecklistItems.deletedAt)
					)
				)
				.orderBy(asc(volunteerSafeguardingChecklistItems.sortOrder)),

			db.select({ id: user.id, name: user.name }).from(user),

			db
				.select({ id: pillars.id, name: pillars.name })
				.from(pillars)
				.where(isNull(pillars.deletedAt))
				.orderBy(asc(pillars.sortOrder))
		]);

	/*
	 * Everything each row's controls need, in four queries rather than four per
	 * row. The list is capped at 500, so these are bounded; grouping in
	 * JavaScript costs less than 2000 round trips.
	 */
	const ids = rows.map((row) => row.id);

	const [checks, credentials, references, placements] = ids.length
		? await Promise.all([
				db
					.select({
						applicationId: volunteerSafeguardingChecks.volunteerApplicationId,
						itemId: volunteerSafeguardingChecks.checklistItemId,
						completedAt: volunteerSafeguardingChecks.completedAt,
						byName: user.name
					})
					.from(volunteerSafeguardingChecks)
					.leftJoin(user, eq(user.id, volunteerSafeguardingChecks.completedBy))
					.where(inArray(volunteerSafeguardingChecks.volunteerApplicationId, ids)),

				db
					.select({
						applicationId: volunteerCredentials.volunteerApplicationId,
						id: volunteerCredentials.id,
						professionName: volunteerProfessions.name,
						otherProfession: volunteerCredentials.otherProfession,
						licenseNumber: volunteerCredentials.licenseNumber,
						licensingBody: volunteerCredentials.licensingBody,
						expiresOn: volunteerCredentials.expiresOn,
						verificationStatus: volunteerCredentials.verificationStatus,
						verificationNote: volunteerCredentials.verificationNote,
						verifiedByName: user.name
					})
					.from(volunteerCredentials)
					.leftJoin(
						volunteerProfessions,
						eq(volunteerProfessions.id, volunteerCredentials.professionId)
					)
					.leftJoin(user, eq(user.id, volunteerCredentials.verifiedBy))
					.where(
						and(
							inArray(volunteerCredentials.volunteerApplicationId, ids),
							isNull(volunteerCredentials.deletedAt)
						)
					)
					.orderBy(asc(volunteerCredentials.id)),

				db
					.select({
						applicationId: volunteerReferences.volunteerApplicationId,
						id: volunteerReferences.id,
						fullName: volunteerReferences.fullName,
						relationship: volunteerReferences.relationship,
						email: volunteerReferences.email,
						phone: volunteerReferences.phone,
						status: volunteerReferences.status,
						responseNote: volunteerReferences.responseNote,
						contactedByName: user.name
					})
					.from(volunteerReferences)
					.leftJoin(user, eq(user.id, volunteerReferences.contactedBy))
					.where(
						and(
							inArray(volunteerReferences.volunteerApplicationId, ids),
							isNull(volunteerReferences.deletedAt)
						)
					)
					.orderBy(asc(volunteerReferences.sortOrder), asc(volunteerReferences.id)),

				db
					.select({
						applicationId: volunteerPlacements.volunteerApplicationId,
						id: volunteerPlacements.id,
						roleDescription: volunteerPlacements.roleDescription,
						startedAt: volunteerPlacements.startedAt,
						endedAt: volunteerPlacements.endedAt,
						pillarName: pillars.name
					})
					.from(volunteerPlacements)
					.leftJoin(pillars, eq(pillars.id, volunteerPlacements.pillarId))
					.where(
						and(
							inArray(volunteerPlacements.volunteerApplicationId, ids),
							isNull(volunteerPlacements.deletedAt)
						)
					)
			])
		: [[], [], [], []];

	const group = <T extends { applicationId: number }>(list: T[]) => {
		const map = new Map<number, T[]>();
		for (const item of list) {
			const bucket = map.get(item.applicationId);
			if (bucket) bucket.push(item);
			else map.set(item.applicationId, [item]);
		}
		return map;
	};

	const checksByApplication = group(checks);
	const credentialsByApplication = group(credentials);
	const referencesByApplication = group(references);
	const placementsByApplication = group(placements);

	auditList(event, 'volunteer_application', {
		search,
		statusId,
		blocked,
		skillId,
		slotId,
		professional,
		results: rows.length
	});

	return {
		rows: rows.map((row) => {
			const done = new Map((checksByApplication.get(row.id) ?? []).map((c) => [c.itemId, c]));

			// Professional-only checks are hidden from a non-professional's
			// checklist, matching what `recomputeSafeguarding` actually requires
			// of them. The same filter as the old detail page, applied per row.
			const checklist = checklistItems
				.filter((item) => row.isProfessional || !item.professionalOnly)
				.map((item) => ({ ...item, done: done.get(item.id) ?? null }));

			return {
				...row,
				checklist,
				checksDone: checklist.filter((item) => item.done).length,
				checksTotal: checklist.length,
				credentialRows: credentialsByApplication.get(row.id) ?? [],
				referenceRows: referencesByApplication.get(row.id) ?? [],
				placementRows: placementsByApplication.get(row.id) ?? [],
				// Recomputed here rather than read off a column so the disabled
				// state in the picker matches what the server would actually do.
				canApprove: canApproveVolunteer({
					safeguardingChecklistComplete: row.safeguardingComplete,
					professionalCredentials: row.credentials,
					credentialsVerified: row.credentialsVerified
				})
			};
		}),
		statuses,
		reviewers,
		pillarOptions,
		skillOptions,
		slotOptions,
		filters: { search, statusId, blocked, skillId, slotId, professional }
	};
};

/** One application id from the posted form, checked against nothing else. */
const rowId = (formData: FormData) => {
	const id = Number(formData.get('id'));
	if (!Number.isFinite(id)) throw error(400, 'Which volunteer?');
	return id;
};

/** The ids of a multi-row selection, posted as repeated `ids` fields. */
const rowIds = (formData: FormData) => {
	const ids = formData
		.getAll('ids')
		.map((value) => Number(value))
		.filter((value) => Number.isFinite(value));

	if (!ids.length) throw error(400, 'Nothing was selected.');
	return ids;
};

export const actions: Actions = {
	/**
	 * The gated transition. `setVolunteerStatus` throws a 422 if the checklist
	 * is incomplete or a claimed credential is unverified — including when this
	 * action is called directly, without the table ever having been rendered.
	 */
	setStatus: async (event: RequestEvent) => {
		const access = await requirePermission(event, 'volunteers.write');
		const formData = await event.request.formData();
		const id = rowId(formData);
		const statusId = Number(formData.get('statusId'));

		if (!Number.isFinite(statusId)) return fail(400, { error: 'Pick a status.' });

		try {
			const result = await setVolunteerStatus(event, access, id, statusId);
			return { ok: true, message: `Moved to ${result.status.label}.` };
		} catch (err) {
			// A refused transition is the gate doing its job, and the message it
			// throws names the actual obstacle. Surfaced as a failure on the row
			// rather than an error page, because the coordinator is mid-queue.
			if (isHttpError(err)) return fail(err.status, { error: err.body.message });
			throw err;
		}
	},

	assign: async (event: RequestEvent) => {
		await requirePermission(event, 'volunteers.write');
		const formData = await event.request.formData();
		const id = rowId(formData);
		const reviewerId = String(formData.get('reviewerId') ?? '') || null;

		await db
			.update(volunteerApplications)
			.set({ assignedReviewerId: reviewerId, updatedAt: new Date() })
			.where(eq(volunteerApplications.id, id));

		audit({ event, action: 'assigned', entityType: 'volunteer_application', entityId: id });
		return { ok: true, message: reviewerId ? 'Assigned.' : 'Unassigned.' };
	},

	/** Ticks (or unticks) one safeguarding check and recomputes the gate. */
	toggleCheck: async (event: RequestEvent) => {
		const access = await requirePermission(event, 'volunteers.safeguarding');
		const formData = await event.request.formData();
		const id = rowId(formData);
		const itemId = Number(formData.get('itemId'));

		if (!Number.isFinite(itemId)) return fail(400, { error: 'Unknown check.' });

		const [existing] = await db
			.select({ id: volunteerSafeguardingChecks.id })
			.from(volunteerSafeguardingChecks)
			.where(
				and(
					eq(volunteerSafeguardingChecks.volunteerApplicationId, id),
					eq(volunteerSafeguardingChecks.checklistItemId, itemId)
				)
			)
			.limit(1);

		if (existing) {
			await db
				.delete(volunteerSafeguardingChecks)
				.where(eq(volunteerSafeguardingChecks.id, existing.id));
		} else {
			await db.insert(volunteerSafeguardingChecks).values({
				volunteerApplicationId: id,
				checklistItemId: itemId,
				completedBy: access.userId,
				completedAt: new Date()
			});
		}

		// Derived, never set by hand — see `recomputeSafeguarding`.
		const complete = await recomputeSafeguarding(id);

		audit({
			event,
			action: 'completed_check',
			entityType: 'volunteer_safeguarding_check',
			entityId: id,
			metadata: { itemId, undone: Boolean(existing), checklistComplete: complete }
		});

		return { ok: true, message: complete ? 'Safeguarding complete.' : null };
	},

	/**
	 * Records the outcome of checking one licence with its issuing body.
	 *
	 * Per credential, not per volunteer: someone may be a verified nurse and an
	 * unverified counsellor, and the approval gate has to see the difference.
	 * `recomputeCredentials` folds these rows back into
	 * `volunteer_applications.credentials_verified`, which is the column
	 * `setVolunteerStatus` reads.
	 */
	verifyCredential: async (event: RequestEvent) => {
		const access = await requirePermission(event, 'volunteers.safeguarding');
		const formData = await event.request.formData();
		const id = rowId(formData);
		const credentialId = Number(formData.get('credentialId'));
		const status = String(formData.get('status') ?? '');

		if (!Number.isFinite(credentialId)) return fail(400, { error: 'Unknown credential.' });
		if (!['pending', 'verified', 'rejected', 'expired'].includes(status)) {
			return fail(400, { error: 'That is not a verification outcome.' });
		}

		// Scoped to this application, so a posted id from another volunteer's
		// row cannot be verified through this action.
		const [credential] = await db
			.select({ id: volunteerCredentials.id })
			.from(volunteerCredentials)
			.where(
				and(
					eq(volunteerCredentials.id, credentialId),
					eq(volunteerCredentials.volunteerApplicationId, id)
				)
			)
			.limit(1);

		if (!credential) return fail(404, { error: 'That credential is not on this application.' });

		await db
			.update(volunteerCredentials)
			.set({
				verificationStatus: status as 'pending' | 'verified' | 'rejected' | 'expired',
				verificationNote: String(formData.get('note') ?? '').trim() || null,
				// Cleared when the outcome is walked back to pending: "checked by
				// whom, when" must not survive the check being undone.
				verifiedBy: status === 'pending' ? null : access.userId,
				verifiedAt: status === 'pending' ? null : new Date(),
				updatedAt: new Date()
			})
			.where(eq(volunteerCredentials.id, credentialId));

		await recomputeCredentials(id);
		await recomputeSafeguarding(id);

		audit({
			event,
			action: 'updated',
			entityType: 'volunteer_credential',
			entityId: credentialId,
			metadata: { applicationId: id, status }
		});

		return { ok: true, message: 'Licence updated.' };
	},

	/** Records what a reference said. `references_checked` is derived from these. */
	setReference: async (event: RequestEvent) => {
		const access = await requirePermission(event, 'volunteers.write');
		const formData = await event.request.formData();
		const id = rowId(formData);
		const referenceId = Number(formData.get('referenceId'));
		const status = String(formData.get('status') ?? '');

		if (!Number.isFinite(referenceId)) return fail(400, { error: 'Unknown reference.' });
		if (
			!['pending', 'contacted', 'satisfactory', 'unsatisfactory', 'unreachable'].includes(status)
		) {
			return fail(400, { error: 'That is not a reference outcome.' });
		}

		const [reference] = await db
			.select({ id: volunteerReferences.id })
			.from(volunteerReferences)
			.where(
				and(
					eq(volunteerReferences.id, referenceId),
					eq(volunteerReferences.volunteerApplicationId, id)
				)
			)
			.limit(1);

		if (!reference) return fail(404, { error: 'That reference is not on this application.' });

		await db
			.update(volunteerReferences)
			.set({
				status: status as
					'pending' | 'contacted' | 'satisfactory' | 'unsatisfactory' | 'unreachable',
				responseNote: String(formData.get('note') ?? '').trim() || null,
				contactedBy: status === 'pending' ? null : access.userId,
				contactedAt: status === 'pending' ? null : new Date(),
				updatedAt: new Date()
			})
			.where(eq(volunteerReferences.id, referenceId));

		await recomputeReferences(id);

		audit({
			event,
			action: 'updated',
			entityType: 'volunteer_reference',
			entityId: referenceId,
			metadata: { applicationId: id, status }
		});

		return { ok: true, message: 'Reference updated.' };
	},

	/** Places an approved volunteer with a programme. */
	addPlacement: async (event: RequestEvent) => {
		const access = await requirePermission(event, 'volunteers.write');
		const formData = await event.request.formData();
		const id = rowId(formData);

		const [application] = await db
			.select({
				complete: volunteerApplications.safeguardingChecklistComplete,
				credentials: volunteerApplications.professionalCredentials,
				credentialsVerified: volunteerApplications.credentialsVerified
			})
			.from(volunteerApplications)
			.where(eq(volunteerApplications.id, id))
			.limit(1);

		// The same gate as approval. Placement is the moment a volunteer actually
		// meets a beneficiary, so it is if anything the more important of the two
		// to hold shut.
		if (
			!application ||
			!canApproveVolunteer({
				safeguardingChecklistComplete: application.complete,
				professionalCredentials: application.credentials,
				credentialsVerified: application.credentialsVerified
			})
		) {
			return fail(422, {
				error: 'This volunteer cannot be placed until safeguarding is complete.'
			});
		}

		const pillarId = Number(formData.get('pillarId'));
		await db.insert(volunteerPlacements).values({
			volunteerApplicationId: id,
			pillarId: Number.isFinite(pillarId) ? pillarId : null,
			roleDescription: String(formData.get('roleDescription') ?? '').trim() || null,
			startedAt: String(formData.get('startedAt') ?? '') || null,
			createdBy: access.userId,
			updatedBy: access.userId
		});

		audit({
			event,
			action: 'created',
			entityType: 'volunteer_application',
			entityId: id,
			metadata: { placement: true }
		});

		return { ok: true, message: 'Placed.' };
	},

	markRead: async (event: RequestEvent) => {
		await requirePermission(event, 'volunteers.write');
		const formData = await event.request.formData();
		const ids = formData.has('ids') ? rowIds(formData) : [rowId(formData)];
		const read = formData.get('read') !== 'false';

		await db
			.update(volunteerApplications)
			.set({ isRead: read, updatedAt: new Date() })
			.where(inArray(volunteerApplications.id, ids));

		return { ok: true, message: read ? 'Marked as read.' : 'Marked as unread.' };
	},

	/* ======================================================================
	   The selection
	   ====================================================================== */

	/**
	 * Moves several volunteers to one status.
	 *
	 * Calls `setVolunteerStatus` once per volunteer rather than writing the
	 * column across a selection, because that function *is* the safeguarding
	 * gate — a bulk `UPDATE` would be a second way to set a status, and the one
	 * that skipped the check. A volunteer the gate refuses is collected and
	 * named in the result rather than silently dropped: "I selected twelve and
	 * it said done" must not hide that two of them did not move.
	 */
	bulkStatus: async (event: RequestEvent) => {
		const access = await requirePermission(event, 'volunteers.write');
		const formData = await event.request.formData();
		const ids = rowIds(formData);
		const statusId = Number(formData.get('statusId'));

		if (!Number.isFinite(statusId)) return fail(400, { error: 'Pick a status.' });

		let moved = 0;
		const skipped: string[] = [];

		for (const id of ids) {
			try {
				await setVolunteerStatus(event, access, id, statusId);
				moved += 1;
			} catch (err) {
				if (!isHttpError(err)) throw err;

				const [row] = await db
					.select({ reference: volunteerApplications.referenceNumber })
					.from(volunteerApplications)
					.where(eq(volunteerApplications.id, id))
					.limit(1);

				skipped.push(row?.reference ?? String(id));
			}
		}

		return {
			ok: true,
			message: skipped.length
				? `${moved} moved. ${skipped.length} skipped — safeguarding incomplete: ${skipped.join(', ')}.`
				: `${moved} moved.`,
			skipped
		};
	},

	bulkAssign: async (event: RequestEvent) => {
		await requirePermission(event, 'volunteers.write');
		const formData = await event.request.formData();
		const ids = rowIds(formData);
		const reviewerId = String(formData.get('reviewerId') ?? '') || null;

		await db
			.update(volunteerApplications)
			.set({ assignedReviewerId: reviewerId, updatedAt: new Date() })
			.where(inArray(volunteerApplications.id, ids));

		for (const id of ids) {
			audit({ event, action: 'assigned', entityType: 'volunteer_application', entityId: id });
		}

		return { ok: true, message: `${ids.length} ${reviewerId ? 'assigned' : 'unassigned'}.` };
	}
};
