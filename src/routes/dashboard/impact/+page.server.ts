import { and, count, countDistinct, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { disbursements, donations, formSubmissions, pillars, regions } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { getImpactMetrics, recomputeImpactMetrics } from '$lib/server/impact';
import { loadSettings } from '$lib/server/settings';
import type { Actions, PageServerLoad } from './$types';

/**
 * The impact dashboard.
 *
 * Read-only by design (§5.9). There is no "enter this quarter's numbers"
 * screen here, because §4 forbids one as the primary source: every figure is
 * computed from case and donation records. The only manual lever is the
 * `impact.override_*` settings, and this screen says plainly when one is in
 * effect — an overridden counter that looked computed would be a quiet lie to
 * whoever reads it next.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'submissions.read');

	const [metrics, settings, byPillar, byRegion, monthly, topDisbursements] = await Promise.all([
		getImpactMetrics(),
		loadSettings(),

		db
			.select({
				pillarId: pillars.id,
				name: pillars.name,
				color: pillars.color,
				cases: count(formSubmissions.id),
				people: countDistinct(formSubmissions.submittedByBeneficiaryId)
			})
			.from(pillars)
			.leftJoin(
				formSubmissions,
				and(eq(formSubmissions.pillarId, pillars.id), isNull(formSubmissions.deletedAt))
			)
			.where(isNull(pillars.deletedAt))
			.groupBy(pillars.id, pillars.name, pillars.color),

		db
			.select({ name: regions.name, cases: count(formSubmissions.id) })
			.from(regions)
			.leftJoin(
				formSubmissions,
				and(eq(formSubmissions.regionId, regions.id), isNull(formSubmissions.deletedAt))
			)
			.where(isNull(regions.deletedAt))
			.groupBy(regions.id, regions.name),

		// Twelve months of confirmed giving. `strftime` on an epoch-ms column
		// needs the /1000 and the 'unixepoch' modifier.
		db
			.select({
				month: sql<string>`strftime('%Y-%m', ${donations.completedAt} / 1000, 'unixepoch')`,
				total: sql<number>`coalesce(sum(${donations.amount}), 0)`,
				gifts: count()
			})
			.from(donations)
			.where(and(eq(donations.status, 'completed'), isNull(donations.deletedAt)))
			.groupBy(sql`strftime('%Y-%m', ${donations.completedAt} / 1000, 'unixepoch')`)
			.orderBy(desc(sql`strftime('%Y-%m', ${donations.completedAt} / 1000, 'unixepoch')`))
			.limit(12),

		db
			.select({
				total: sql<number>`coalesce(sum(${disbursements.amount}), 0)`,
				count: count()
			})
			.from(disbursements)
			.where(isNull(disbursements.deletedAt))
	]);

	const overrides = [...settings.values()]
		.filter((row) => row.key.startsWith('impact.override_') && row.value?.trim())
		.map((row) => row.label);

	return {
		metrics: metrics.values,
		overridden: metrics.overridden,
		overrideLabels: overrides,
		computedAt: metrics.computedAt,
		byPillar,
		byRegion,
		monthly: monthly.reverse(),
		disbursed: topDisbursements[0] ?? { total: 0, count: 0 }
	};
};

export const actions: Actions = {
	/** Forces a recompute, for when staff want the number as of right now. */
	recompute: async (event) => {
		await requirePermission(event, 'submissions.read');
		await recomputeImpactMetrics();
		return { ok: true };
	}
};
