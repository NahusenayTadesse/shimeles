import { and, asc, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	regions,
	statusOptions,
	user,
	volunteerApplications,
	volunteerApplicationSkills,
	volunteerAvailability,
	volunteerSkills,
	volunteerTimeSlots
} from '$lib/server/db/schema';
import { searchFilter } from '$lib/server/query';
import { requirePermission } from '$lib/server/permissions';
import { listStatuses } from '$lib/server/workflow';
import { auditList } from '$lib/server/audit';
import type { PageServerLoad } from './$types';

/**
 * The volunteer list.
 *
 * Volunteers are not pillar-scoped the way cases are: a coordinator manages the
 * whole volunteer pipeline, and a volunteer's application contains no
 * beneficiary data. The permission (`volunteers.read`) is the whole gate.
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

	const [rows, statuses, skillOptions, slotOptions] = await Promise.all([
		db
			.select({
				id: volunteerApplications.id,
				reference: volunteerApplications.referenceNumber,
				fullName: volunteerApplications.fullName,
				email: volunteerApplications.email,
				phone: volunteerApplications.phone,
				availability: volunteerApplications.availability,
				credentials: volunteerApplications.professionalCredentials,
				credentialsVerified: volunteerApplications.credentialsVerified,
				referencesChecked: volunteerApplications.referencesChecked,
				safeguardingComplete: volunteerApplications.safeguardingChecklistComplete,
				isRead: volunteerApplications.isRead,
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
			.orderBy(asc(volunteerTimeSlots.sortOrder), asc(volunteerTimeSlots.id))
	]);

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
		rows,
		statuses,
		skillOptions,
		slotOptions,
		filters: { search, statusId, blocked, skillId, slotId, professional }
	};
};
