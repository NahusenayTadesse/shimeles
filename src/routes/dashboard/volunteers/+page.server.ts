import { and, desc, eq, isNull, like, or, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { regions, statusOptions, user, volunteerApplications } from '$lib/server/db/schema';
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

	const clauses: (SQL | undefined)[] = [isNull(volunteerApplications.deletedAt)];

	if (statusId) clauses.push(eq(volunteerApplications.statusId, Number(statusId)));
	// "Blocked" is the coordinator's real working queue: everyone who cannot be
	// approved yet because their safeguarding checklist is incomplete.
	if (blocked) clauses.push(eq(volunteerApplications.safeguardingChecklistComplete, false));
	if (search) {
		const needle = `%${search}%`;
		clauses.push(
			or(
				like(volunteerApplications.referenceNumber, needle),
				like(volunteerApplications.fullName, needle),
				like(volunteerApplications.email, needle),
				like(volunteerApplications.phone, needle)
			)
		);
	}

	const [rows, statuses] = await Promise.all([
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

		listStatuses('volunteer')
	]);

	auditList(event, 'volunteer_application', { search, statusId, blocked, results: rows.length });

	return { rows, statuses, filters: { search, statusId, blocked } };
};
