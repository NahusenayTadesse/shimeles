import { redirect } from '@sveltejs/kit';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	donations,
	formDefinitions,
	formSubmissions,
	pillars,
	statusOptions,
	volunteerApplications
} from '$lib/server/db/schema';
import { auth } from '$lib/server/auth';
import { requireUser, pillarScope } from '$lib/server/permissions';
import { getImpactMetrics } from '$lib/server/impact';
import type { Actions, PageServerLoad } from './$types';

/**
 * The dashboard overview.
 *
 * Deliberately a summary rather than a workspace: counts by status, the newest
 * cases the signed-in person may actually see, and the reconciliation backlog.
 * Everything obeys pillar scope, so two staff members on different programmes
 * see genuinely different numbers here.
 */
export const load: PageServerLoad = async (event) => {
	const access = await requireUser(event);
	const scope = pillarScope(access, formSubmissions.pillarId);
	const scopeClause = scope ? [scope] : [];

	const canSeeCases = access.permissions.has('submissions.read');
	const canSeeMoney = access.permissions.has('donations.read');
	const canSeeVolunteers = access.permissions.has('volunteers.read');

	const [byStatus, recent, volunteerCount, pendingDonations, metrics] = await Promise.all([
		canSeeCases
			? db
					.select({
						statusId: formSubmissions.statusId,
						label: statusOptions.label,
						color: statusOptions.color,
						stage: statusOptions.stage,
						total: count()
					})
					.from(formSubmissions)
					.leftJoin(statusOptions, eq(statusOptions.id, formSubmissions.statusId))
					.where(and(isNull(formSubmissions.deletedAt), ...scopeClause))
					.groupBy(
						formSubmissions.statusId,
						statusOptions.label,
						statusOptions.color,
						statusOptions.stage
					)
			: Promise.resolve([]),

		canSeeCases
			? db
					.select({
						id: formSubmissions.id,
						reference: formSubmissions.referenceNumber,
						name: formSubmissions.submittedByName,
						createdAt: formSubmissions.createdAt,
						isRead: formSubmissions.isRead,
						priority: formSubmissions.priority,
						statusLabel: statusOptions.label,
						statusColor: statusOptions.color,
						pillarName: pillars.name,
						formName: formDefinitions.name
					})
					.from(formSubmissions)
					.leftJoin(statusOptions, eq(statusOptions.id, formSubmissions.statusId))
					.leftJoin(pillars, eq(pillars.id, formSubmissions.pillarId))
					.leftJoin(formDefinitions, eq(formDefinitions.id, formSubmissions.formDefinitionId))
					.where(and(isNull(formSubmissions.deletedAt), ...scopeClause))
					.orderBy(desc(formSubmissions.createdAt))
					.limit(8)
			: Promise.resolve([]),

		canSeeVolunteers
			? db
					.select({ total: count() })
					.from(volunteerApplications)
					.where(
						and(
							isNull(volunteerApplications.deletedAt),
							eq(volunteerApplications.safeguardingChecklistComplete, false)
						)
					)
					.then((rows) => rows[0]?.total ?? 0)
			: 0,

		canSeeMoney
			? db
					.select({ total: count(), amount: sql<number>`coalesce(sum(${donations.amount}), 0)` })
					.from(donations)
					.where(and(eq(donations.status, 'pending_reconciliation'), isNull(donations.deletedAt)))
					.then((rows) => rows[0] ?? { total: 0, amount: 0 })
			: { total: 0, amount: 0 },

		getImpactMetrics()
	]);

	return {
		byStatus,
		recent,
		volunteersAwaitingSafeguarding: volunteerCount,
		pendingDonations,
		metrics: metrics.values,
		metricsComputedAt: metrics.computedAt
	};
};

export const actions: Actions = {
	logout: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		throw redirect(302, '/login');
	}
};
