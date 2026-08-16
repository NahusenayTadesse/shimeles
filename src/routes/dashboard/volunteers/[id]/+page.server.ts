import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	pillars,
	regions,
	statusOptions,
	user,
	volunteerApplications,
	volunteerPlacements,
	volunteerSafeguardingChecklistItems,
	volunteerSafeguardingChecks
} from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import {
	canApproveVolunteer,
	listStatuses,
	recomputeSafeguarding,
	setVolunteerStatus
} from '$lib/server/workflow';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * One volunteer application, and the safeguarding gate.
 *
 * §3.6's hard rule lives in `setVolunteerStatus`, not here: this route disables
 * the approve control when the checklist is incomplete, but the *reason* that
 * matters is that the transition function refuses the same move regardless of
 * what the browser posts. The UI is a courtesy; the server call is the control.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'volunteers.read');
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(404, 'Not found');

	const [application] = await db
		.select({
			id: volunteerApplications.id,
			reference: volunteerApplications.referenceNumber,
			fullName: volunteerApplications.fullName,
			email: volunteerApplications.email,
			phone: volunteerApplications.phone,
			areasOfInterest: volunteerApplications.areasOfInterest,
			skills: volunteerApplications.skills,
			availability: volunteerApplications.availability,
			professionalCredentials: volunteerApplications.professionalCredentials,
			credentialsVerified: volunteerApplications.credentialsVerified,
			referencesChecked: volunteerApplications.referencesChecked,
			safeguardingChecklistComplete: volunteerApplications.safeguardingChecklistComplete,
			data: volunteerApplications.data,
			statusId: volunteerApplications.statusId,
			reviewerId: volunteerApplications.assignedReviewerId,
			language: volunteerApplications.language,
			createdAt: volunteerApplications.createdAt,
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
		.where(and(eq(volunteerApplications.id, id), isNull(volunteerApplications.deletedAt)))
		.limit(1);

	if (!application) throw error(404, 'That volunteer application does not exist.');

	const isProfessional = Boolean(application.professionalCredentials?.trim());

	const [items, completed, statuses, reviewers, pillarRows, placements] = await Promise.all([
		db
			.select()
			.from(volunteerSafeguardingChecklistItems)
			.where(
				and(
					eq(volunteerSafeguardingChecklistItems.isActive, true),
					isNull(volunteerSafeguardingChecklistItems.deletedAt)
				)
			)
			.orderBy(asc(volunteerSafeguardingChecklistItems.sortOrder)),

		db
			.select({
				itemId: volunteerSafeguardingChecks.checklistItemId,
				completedAt: volunteerSafeguardingChecks.completedAt,
				note: volunteerSafeguardingChecks.note,
				byName: user.name
			})
			.from(volunteerSafeguardingChecks)
			.leftJoin(user, eq(user.id, volunteerSafeguardingChecks.completedBy))
			.where(eq(volunteerSafeguardingChecks.volunteerApplicationId, id)),

		listStatuses('volunteer'),
		db.select({ id: user.id, name: user.name }).from(user),
		db
			.select({ id: pillars.id, name: pillars.name })
			.from(pillars)
			.where(isNull(pillars.deletedAt)),

		db
			.select({
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
					eq(volunteerPlacements.volunteerApplicationId, id),
					isNull(volunteerPlacements.deletedAt)
				)
			)
	]);

	audit({
		event,
		action: 'viewed',
		entityType: 'volunteer_application',
		entityId: id,
		metadata: { reference: application.reference }
	});

	if (!application.safeguardingChecklistComplete) {
		// Nothing to do; the flag is already correct.
	}

	const completedMap = new Map(completed.map((row) => [row.itemId, row]));

	// Professional-only checks are hidden from a non-professional's checklist,
	// matching what `recomputeSafeguarding` actually requires of them.
	const checklist = items
		.filter((item) => isProfessional || !item.professionalOnly)
		.map((item) => ({
			id: item.id,
			label: item.label,
			description: item.description,
			professionalOnly: item.professionalOnly,
			done: completedMap.get(item.id) ?? null
		}));

	return {
		application,
		checklist,
		statuses,
		reviewers,
		pillarOptions: pillarRows,
		placements,
		isProfessional,
		canApprove: canApproveVolunteer(application)
	};
};

async function guard(event: Parameters<PageServerLoad>[0]) {
	const access = await requirePermission(event, 'volunteers.write');
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(404, 'Not found');
	return { access, id };
}

export const actions: Actions = {
	/** Ticks (or unticks) one safeguarding check and recomputes the gate. */
	toggleCheck: async (event) => {
		const access = await requirePermission(event, 'volunteers.safeguarding');
		const id = Number(event.params.id);
		const formData = await event.request.formData();
		const itemId = Number(formData.get('itemId'));
		const note = String(formData.get('note') ?? '').trim();

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
				completedAt: new Date(),
				note: note || null
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

		return { ok: true };
	},

	/** Records that a professional volunteer's licence has been verified. */
	verifyCredentials: async (event) => {
		await requirePermission(event, 'volunteers.safeguarding');
		const id = Number(event.params.id);
		const formData = await event.request.formData();
		const verified = String(formData.get('verified')) === 'true';

		await db
			.update(volunteerApplications)
			.set({ credentialsVerified: verified, updatedAt: new Date() })
			.where(eq(volunteerApplications.id, id));

		audit({
			event,
			action: 'updated',
			entityType: 'volunteer_application',
			entityId: id,
			metadata: { credentialsVerified: verified }
		});

		return { ok: true };
	},

	setReferencesChecked: async (event) => {
		const { id } = await guard(event as never);
		const formData = await event.request.formData();
		const checked = String(formData.get('checked')) === 'true';

		await db
			.update(volunteerApplications)
			.set({ referencesChecked: checked, updatedAt: new Date() })
			.where(eq(volunteerApplications.id, id));

		audit({
			event,
			action: 'updated',
			entityType: 'volunteer_application',
			entityId: id,
			metadata: { referencesChecked: checked }
		});

		return { ok: true };
	},

	/**
	 * The gated transition. `setVolunteerStatus` throws a 422 if the checklist
	 * is incomplete or a claimed credential is unverified — including when this
	 * action is called directly, without the page ever having been rendered.
	 */
	setStatus: async (event) => {
		const { access, id } = await guard(event as never);
		const formData = await event.request.formData();
		const statusId = Number(formData.get('statusId'));

		if (!Number.isFinite(statusId)) return fail(400, { error: 'Pick a status.' });

		await setVolunteerStatus(event, access, id, statusId);
		return { ok: true };
	},

	assign: async (event) => {
		const { id } = await guard(event as never);
		const formData = await event.request.formData();
		const reviewerId = String(formData.get('reviewerId') ?? '') || null;

		await db
			.update(volunteerApplications)
			.set({ assignedReviewerId: reviewerId, updatedAt: new Date() })
			.where(eq(volunteerApplications.id, id));

		audit({ event, action: 'assigned', entityType: 'volunteer_application', entityId: id });
		return { ok: true };
	},

	/** Places an approved volunteer with a programme. */
	addPlacement: async (event) => {
		const { access, id } = await guard(event as never);
		const formData = await event.request.formData();

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
		return { ok: true };
	}
};
