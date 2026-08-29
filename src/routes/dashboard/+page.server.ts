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
import { toMoneyTotals } from '$lib/money';
import type { ChartSeries } from '$lib/charts/types';
import type { Actions, PageServerLoad } from './$types';

/**
 * The dashboard overview.
 *
 * A summary and, first of all, a queue: what is waiting on the person reading
 * it, then how things stand. It used to open on four totals, which answer "how
 * are we doing" and never "what should I do next" — and it answered even that
 * only for caseworkers, since every panel was built around applications.
 *
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

	const [byStatus, recent, recentVolunteers, volunteerCount, pendingDonations, metrics] =
		await Promise.all([
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

			/*
			 * The same list applications have always had, for the other half of the
			 * staff. A volunteer coordinator used to open this screen and find two
			 * numbers and nothing to act on, because every panel here was built
			 * around cases.
			 */
			canSeeVolunteers
				? db
						.select({
							id: volunteerApplications.id,
							reference: volunteerApplications.referenceNumber,
							fullName: volunteerApplications.fullName,
							createdAt: volunteerApplications.createdAt,
							isRead: volunteerApplications.isRead,
							safeguardingComplete: volunteerApplications.safeguardingChecklistComplete,
							statusLabel: statusOptions.label,
							statusColor: statusOptions.color
						})
						.from(volunteerApplications)
						.leftJoin(statusOptions, eq(statusOptions.id, volunteerApplications.statusId))
						.where(isNull(volunteerApplications.deletedAt))
						.orderBy(desc(volunteerApplications.createdAt))
						.limit(6)
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

			// Grouped by currency: the backlog is "12 gifts, ETB 40,000 and USD 300
			// pledged", and the one figure it used to show was santim added to cents.
			canSeeMoney
				? db
						.select({
							currency: donations.currency,
							total: count(),
							amount: sql<number>`coalesce(sum(${donations.amount}), 0)`
						})
						.from(donations)
						.where(and(eq(donations.status, 'pending_reconciliation'), isNull(donations.deletedAt)))
						.groupBy(donations.currency)
						.then((rows) => ({
							total: rows.reduce((sum, row) => sum + row.total, 0),
							totals: toMoneyTotals(rows)
						}))
				: { total: 0, totals: [] },

			getImpactMetrics()
		]);

	/**
	 * The status split, as a chart.
	 *
	 * Where the caseload sits is a proportion question — how much of the board
	 * is still waiting on somebody — and a column of numbers makes you do that
	 * arithmetic in your head. Fixed as a doughnut: this is a small card, and a
	 * shape picker on it would be more control than the panel is worth.
	 */
	const statusChart: ChartSeries = {
		id: 'status',
		title: 'Cases by status',
		unit: 'cases',
		kinds: ['doughnut'],
		points: byStatus.map((row) => ({
			label: row.label ?? 'No status',
			value: row.total,
			color: row.color
		}))
	};

	return {
		byStatus,
		statusChart,
		recent,
		recentVolunteers,
		volunteersAwaitingSafeguarding: volunteerCount,
		pendingDonations,
		metrics: metrics.values,
		metricsMoney: metrics.money,
		metricsComputedAt: metrics.computedAt
	};
};

export const actions: Actions = {
	logout: async (event) => {
		await auth.api.signOut({ headers: event.request.headers });
		throw redirect(302, '/login');
	}
};
