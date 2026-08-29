import { and, count, countDistinct, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { disbursements, donations, formSubmissions, pillars, regions } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { getImpactMetrics, recomputeImpactMetrics } from '$lib/server/impact';
import { loadSettings } from '$lib/server/settings';
import { toMoneyTotals } from '$lib/money';
import { kindsFor, type ChartSeries } from '$lib/charts/types';
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

		// Twelve months of confirmed giving, split by currency. `strftime` on an
		// epoch-ms column needs the /1000 and the 'unixepoch' modifier.
		//
		// The limit is on months, not on rows, so it cannot be a `LIMIT 12` here
		// any more — a month with birr and dollars in it is two rows, and twelve
		// rows would silently be six months. The months are cut in JS below.
		db
			.select({
				month: sql<string>`strftime('%Y-%m', ${donations.completedAt} / 1000, 'unixepoch')`,
				currency: donations.currency,
				total: sql<number>`coalesce(sum(${donations.amount}), 0)`,
				gifts: count()
			})
			.from(donations)
			.where(and(eq(donations.status, 'completed'), isNull(donations.deletedAt)))
			.groupBy(
				sql`strftime('%Y-%m', ${donations.completedAt} / 1000, 'unixepoch')`,
				donations.currency
			)
			.orderBy(desc(sql`strftime('%Y-%m', ${donations.completedAt} / 1000, 'unixepoch')`)),

		db
			.select({
				currency: disbursements.currency,
				total: sql<number>`coalesce(sum(${disbursements.amount}), 0)`,
				count: count()
			})
			.from(disbursements)
			.where(isNull(disbursements.deletedAt))
			.groupBy(disbursements.currency)
	]);

	/**
	 * The monthly rows, folded into one entry per month carrying a total per
	 * currency. The chart draws a bar per currency rather than one bar whose
	 * height was santim added to cents.
	 */
	const months = [...new Set(monthly.map((row) => row.month))].slice(0, 12);
	const byMonth = months
		.map((month) => {
			const rows = monthly.filter((row) => row.month === month);
			return {
				month,
				gifts: rows.reduce((sum, row) => sum + row.gifts, 0),
				totals: toMoneyTotals(rows.map((row) => ({ ...row, amount: row.total })))
			};
		})
		.reverse();

	// The `_currency` companions say what unit a money override is in, not that
	// one is in force — listing them here would report an override on an
	// installation that has never set one.
	const overrides = [...settings.values()]
		.filter(
			(row) =>
				row.key.startsWith('impact.override_') &&
				!row.key.endsWith('_currency') &&
				row.value?.trim()
		)
		.map((row) => row.label);

	/*
	 * The charts.
	 *
	 * `kindsFor` decides what each set of numbers may be drawn as, from the
	 * numbers themselves, so the screen never has to re-argue it — and a month
	 * series can never come back offering a pie.
	 */
	const casesByPillar: ChartSeries = {
		id: 'pillars',
		title: 'Cases by programme',
		unit: 'cases',
		points: byPillar.map((row) => ({ label: row.name, value: row.cases, color: row.color })),
		kinds: kindsFor(byPillar.map((row) => ({ label: row.name, value: row.cases })))
	};

	const peopleByPillar: ChartSeries = {
		id: 'people',
		title: 'People reached by programme',
		unit: 'people',
		points: byPillar.map((row) => ({ label: row.name, value: row.people, color: row.color })),
		kinds: kindsFor(byPillar.map((row) => ({ label: row.name, value: row.people })))
	};

	// Regions are a long tail — a dozen of them make an unreadable pie and a
	// worse radar — so only the ones with cases, biggest first, and bars.
	const regionPoints = byRegion
		.filter((row) => row.cases > 0)
		.sort((a, b) => b.cases - a.cases)
		.map((row) => ({ label: row.name, value: row.cases }));

	const casesByRegion: ChartSeries = {
		id: 'regions',
		title: 'Cases by region',
		unit: 'cases',
		points: regionPoints,
		kinds: kindsFor(regionPoints)
	};

	/*
	 * Money is one chart per currency, never one chart across them.
	 *
	 * There is no shared scale between santim and cents, so a bar summing both
	 * measures nothing and a pie of both is worse. Each currency gets its own
	 * ordered series, which is the question the chart is actually asked: is
	 * giving in this currency going up or down.
	 */
	// "Aug 26" rather than "2026-08": short enough for an axis, and carrying the
	// year, which a bare month name loses the moment the window spans one.
	const MONTH_NAMES = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];
	const monthLabel = (month: string) => {
		const [year, index] = month.split('-');
		return `${MONTH_NAMES[Number(index) - 1] ?? month} ${year.slice(2)}`;
	};

	const currencies = [...new Set(monthly.map((row) => row.currency))].sort();
	const givingByMonth: ChartSeries[] = currencies.map((currency) => {
		const points = byMonth.map((row) => ({
			label: monthLabel(row.month),
			value: row.totals.find((total) => total.currency === currency)?.amount ?? 0
		}));
		return {
			id: `giving-${currency.toLowerCase()}`,
			title: `Confirmed giving, ${currency}`,
			currency,
			points,
			// Ordered time: bars or a line, and nothing that implies a whole.
			kinds: kindsFor(points, { ordered: true })
		};
	});

	return {
		metrics: metrics.values,
		metricsMoney: metrics.money,
		charts: { casesByPillar, peopleByPillar, casesByRegion, givingByMonth },
		overridden: metrics.overridden,
		overrideLabels: overrides,
		computedAt: metrics.computedAt,
		byPillar,
		byRegion,
		monthly: byMonth,
		/** Every currency the Foundation has ordered a payment in, kept apart. */
		disbursed: {
			count: topDisbursements.reduce((sum, row) => sum + row.count, 0),
			totals: toMoneyTotals(topDisbursements.map((row) => ({ ...row, amount: row.total })))
		}
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
