import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
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
	volunteerInterests,
	volunteerPlacements,
	volunteerProfessions,
	volunteerReferences,
	volunteerSafeguardingChecklistItems,
	volunteerSafeguardingChecks,
	volunteerSkillCategories,
	volunteerSkills,
	volunteerTimeSlots
} from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import {
	canApproveVolunteer,
	listStatuses,
	recomputeSafeguarding,
	setVolunteerStatus
} from '$lib/server/workflow';
import { recomputeCredentials, recomputeReferences } from '$lib/server/volunteers';
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
			city: volunteerApplications.city,
			dateOfBirth: volunteerApplications.dateOfBirth,
			gender: volunteerApplications.gender,
			occupation: volunteerApplications.occupation,
			organisationName: volunteerApplications.organisationName,
			country: volunteerApplications.country,
			emergencyContactName: volunteerApplications.emergencyContactName,
			emergencyContactPhone: volunteerApplications.emergencyContactPhone,
			emergencyContactRelationship: volunteerApplications.emergencyContactRelationship,
			areasOfInterest: volunteerApplications.areasOfInterest,
			skills: volunteerApplications.skills,
			availability: volunteerApplications.availability,
			hoursPerWeek: volunteerApplications.hoursPerWeek,
			commitmentMonths: volunteerApplications.commitmentMonths,
			availableFrom: volunteerApplications.availableFrom,
			motivation: volunteerApplications.motivation,
			heardAbout: volunteerApplications.heardAbout,
			hasPriorConviction: volunteerApplications.hasPriorConviction,
			priorConvictionDetail: volunteerApplications.priorConvictionDetail,
			backgroundCheckConsentAt: volunteerApplications.backgroundCheckConsentAt,
			codeOfConductAgreedAt: volunteerApplications.codeOfConductAgreedAt,
			declaredAccurateAt: volunteerApplications.declaredAccurateAt,
			acknowledgedNoGuaranteeAt: volunteerApplications.acknowledgedNoGuaranteeAt,
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

	const [
		items,
		completed,
		statuses,
		reviewers,
		pillarRows,
		placements,
		claimedSkills,
		availability,
		credentials,
		references,
		interests
	] = await Promise.all([
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
			),

		// The catalogue joins. These are what make a volunteer searchable —
		// see the note at the top of `$lib/server/volunteers`.
		db
			.select({
				id: volunteerApplicationSkills.id,
				proficiency: volunteerApplicationSkills.proficiency,
				yearsExperience: volunteerApplicationSkills.yearsExperience,
				note: volunteerApplicationSkills.note,
				name: volunteerSkills.name,
				requiresCredential: volunteerSkills.requiresCredential,
				categoryName: volunteerSkillCategories.name
			})
			.from(volunteerApplicationSkills)
			.innerJoin(volunteerSkills, eq(volunteerSkills.id, volunteerApplicationSkills.skillId))
			.leftJoin(
				volunteerSkillCategories,
				eq(volunteerSkillCategories.id, volunteerSkills.categoryId)
			)
			.where(eq(volunteerApplicationSkills.volunteerApplicationId, id))
			.orderBy(asc(volunteerSkillCategories.sortOrder), asc(volunteerSkills.sortOrder)),

		db
			.select({
				id: volunteerAvailability.id,
				label: volunteerTimeSlots.label,
				dayOfWeek: volunteerTimeSlots.dayOfWeek,
				startTime: volunteerTimeSlots.startTime,
				endTime: volunteerTimeSlots.endTime,
				effectiveFrom: volunteerAvailability.effectiveFrom,
				effectiveUntil: volunteerAvailability.effectiveUntil
			})
			.from(volunteerAvailability)
			.innerJoin(volunteerTimeSlots, eq(volunteerTimeSlots.id, volunteerAvailability.timeSlotId))
			.where(eq(volunteerAvailability.volunteerApplicationId, id))
			.orderBy(asc(volunteerTimeSlots.sortOrder)),

		db
			.select({
				id: volunteerCredentials.id,
				professionName: volunteerProfessions.name,
				professionCategory: volunteerProfessions.category,
				requiresLicense: volunteerProfessions.requiresLicense,
				otherProfession: volunteerCredentials.otherProfession,
				licenseNumber: volunteerCredentials.licenseNumber,
				licensingBody: volunteerCredentials.licensingBody,
				specialization: volunteerCredentials.specialization,
				yearsExperience: volunteerCredentials.yearsExperience,
				issuedOn: volunteerCredentials.issuedOn,
				expiresOn: volunteerCredentials.expiresOn,
				verificationStatus: volunteerCredentials.verificationStatus,
				verificationNote: volunteerCredentials.verificationNote,
				verifiedAt: volunteerCredentials.verifiedAt,
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
					eq(volunteerCredentials.volunteerApplicationId, id),
					isNull(volunteerCredentials.deletedAt)
				)
			)
			.orderBy(asc(volunteerCredentials.id)),

		db
			.select({
				id: volunteerReferences.id,
				fullName: volunteerReferences.fullName,
				relationship: volunteerReferences.relationship,
				organization: volunteerReferences.organization,
				email: volunteerReferences.email,
				phone: volunteerReferences.phone,
				status: volunteerReferences.status,
				responseNote: volunteerReferences.responseNote,
				contactedAt: volunteerReferences.contactedAt,
				contactedByName: user.name
			})
			.from(volunteerReferences)
			.leftJoin(user, eq(user.id, volunteerReferences.contactedBy))
			.where(
				and(
					eq(volunteerReferences.volunteerApplicationId, id),
					isNull(volunteerReferences.deletedAt)
				)
			)
			.orderBy(asc(volunteerReferences.sortOrder), asc(volunteerReferences.id)),

		db
			.select({ id: pillars.id, name: pillars.name })
			.from(volunteerInterests)
			.innerJoin(pillars, eq(pillars.id, volunteerInterests.pillarId))
			.where(eq(volunteerInterests.volunteerApplicationId, id))
			.orderBy(asc(pillars.sortOrder))
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
		claimedSkills,
		availability,
		credentials,
		references,
		// Falls back to the legacy JSON column for applications taken through the
		// old dynamic form, which have no `volunteer_interests` rows.
		interests: interests.length
			? interests
			: (application.areasOfInterest ?? [])
					.map((value) => pillarRows.find((pillar) => pillar.id === value))
					.filter((pillar): pillar is { id: number; name: string } => Boolean(pillar)),
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

	/**
	 * Records the outcome of checking one licence with its issuing body.
	 *
	 * Per credential, not per volunteer: someone may be a verified nurse and an
	 * unverified counsellor, and the approval gate has to see the difference.
	 * `recomputeCredentials` folds these rows back into
	 * `volunteer_applications.credentials_verified`, which is the column
	 * `setVolunteerStatus` reads — so this is the only way that flag moves for
	 * an application that has credential rows.
	 */
	verifyCredential: async (event) => {
		const access = await requirePermission(event, 'volunteers.safeguarding');
		const id = Number(event.params.id);
		const formData = await event.request.formData();
		const credentialId = Number(formData.get('credentialId'));
		const status = String(formData.get('status') ?? '');
		const note = String(formData.get('note') ?? '').trim();

		if (!Number.isFinite(credentialId)) return fail(400, { error: 'Unknown credential.' });
		if (!['pending', 'verified', 'rejected', 'expired'].includes(status)) {
			return fail(400, { error: 'That is not a verification outcome.' });
		}

		// Scoped to this application, so a posted id from another volunteer's
		// file cannot be verified through this route.
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
				verificationNote: note || null,
				// Cleared when the outcome is walked back to pending: "checked by
				// whom, when" must not survive the check being undone.
				verifiedBy: status === 'pending' ? null : access.userId,
				verifiedAt: status === 'pending' ? null : new Date(),
				updatedAt: new Date()
			})
			.where(eq(volunteerCredentials.id, credentialId));

		await recomputeCredentials(id);

		audit({
			event,
			action: 'updated',
			entityType: 'volunteer_credential',
			entityId: credentialId,
			metadata: { applicationId: id, status }
		});

		return { ok: true };
	},

	/**
	 * Records what a referee said. `references_checked` on the application is
	 * derived from these rows by `recomputeReferences` — it goes true only when
	 * every reference has come back satisfactory.
	 */
	updateReference: async (event) => {
		const { access, id } = await guard(event as never);
		const formData = await event.request.formData();
		const referenceId = Number(formData.get('referenceId'));
		const status = String(formData.get('status') ?? '');
		const note = String(formData.get('responseNote') ?? '').trim();

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
				responseNote: note || null,
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

		return { ok: true };
	},

	/**
	 * The manual flags, for applications taken through the old dynamic form —
	 * they have a credentials paragraph and a references paragraph rather than
	 * rows, and there is nothing per-licence to verify.
	 *
	 * Refused outright once structured rows exist: a hand-set flag that the next
	 * `recompute` silently overwrites is worse than no control at all, and this
	 * one gates approval.
	 */
	setLegacyChecks: async (event) => {
		const { id } = await guard(event as never);
		await requirePermission(event, 'volunteers.safeguarding');
		const formData = await event.request.formData();
		const field = String(formData.get('field') ?? '');
		const checked = String(formData.get('checked')) === 'true';

		const [rows] = await Promise.all([
			field === 'credentials'
				? db
						.select({ id: volunteerCredentials.id })
						.from(volunteerCredentials)
						.where(
							and(
								eq(volunteerCredentials.volunteerApplicationId, id),
								isNull(volunteerCredentials.deletedAt)
							)
						)
						.limit(1)
				: db
						.select({ id: volunteerReferences.id })
						.from(volunteerReferences)
						.where(
							and(
								eq(volunteerReferences.volunteerApplicationId, id),
								isNull(volunteerReferences.deletedAt)
							)
						)
						.limit(1)
		]);

		if (rows.length) {
			return fail(422, {
				error:
					field === 'credentials'
						? 'Verify each licence individually — this flag is derived from them.'
						: 'Record each reference individually — this flag is derived from them.'
			});
		}

		if (field !== 'credentials' && field !== 'references') {
			return fail(400, { error: 'Unknown check.' });
		}

		await db
			.update(volunteerApplications)
			.set(
				field === 'credentials'
					? { credentialsVerified: checked, updatedAt: new Date() }
					: { referencesChecked: checked, updatedAt: new Date() }
			)
			.where(eq(volunteerApplications.id, id));

		audit({
			event,
			action: 'updated',
			entityType: 'volunteer_application',
			entityId: id,
			metadata: { [field === 'credentials' ? 'credentialsVerified' : 'referencesChecked']: checked }
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
