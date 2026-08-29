import { and, count, countDistinct, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { formSubmissions, pillars } from '$lib/server/db/schema';
import { cached } from '$lib/server/cache';
import { kindsFor, type ChartSeries } from '$lib/charts/types';

/**
 * The charts a public page may draw.
 *
 * A named allow-list rather than a free query, for two reasons. A block editor
 * that could point at any aggregate is one careless choice away from
 * publishing something that should not leave the dashboard — and every figure
 * a donor sees should be one somebody decided to publish, not one that
 * happened to be reachable.
 *
 * Both series here are counts per programme: aggregate, no person in them, and
 * the question a donor is actually asking, which is where the work goes.
 */
export const PUBLIC_CHARTS = {
	'cases-by-pillar': 'Cases by programme',
	'people-by-pillar': 'People reached by programme'
} as const;

export type PublicChartKey = keyof typeof PUBLIC_CHARTS;

export const isPublicChartKey = (value: unknown): value is PublicChartKey =>
	typeof value === 'string' && value in PUBLIC_CHARTS;

/**
 * Cached like the impact counters beside it: these are slow-moving totals, and
 * a donor page should not run two aggregates per visitor to draw a ring that
 * changes twice a week.
 */
const load = () =>
	cached('charts:public', async () => {
		const rows = await db
			.select({
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
			.where(and(isNull(pillars.deletedAt), eq(pillars.isActive, true)))
			.groupBy(pillars.id, pillars.name, pillars.color)
			.orderBy(pillars.sortOrder);

		return rows;
	});

/**
 * One series, or null when the key is unknown or there is nothing in it yet.
 *
 * Null rather than an empty chart on purpose: a public page should leave the
 * space out entirely rather than show a donor an empty ring captioned with a
 * promise.
 */
export async function getPublicChart(key: string): Promise<ChartSeries | null> {
	if (!isPublicChartKey(key)) return null;

	const rows = await load();
	const field = key === 'cases-by-pillar' ? 'cases' : 'people';
	const points = rows.map((row) => ({
		label: row.name,
		value: Number(row[field] ?? 0),
		color: row.color
	}));

	if (!points.some((point) => point.value > 0)) return null;

	return {
		id: key,
		title: PUBLIC_CHARTS[key],
		unit: field === 'cases' ? 'cases' : 'people',
		points,
		// The public side does not offer a switcher, so the first kind is the
		// one drawn. Programmes summing to a whole read as a ring.
		kinds: kindsFor(points).includes('doughnut') ? ['doughnut'] : ['bar']
	};
}
