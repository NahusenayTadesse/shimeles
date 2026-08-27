import { and, countDistinct, eq, inArray, isNotNull, isNull, sql, sum } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	donations,
	formSubmissions,
	impactMetricsCache,
	pillars,
	statusOptions
} from '$lib/server/db/schema';
import { cached, invalidate } from '$lib/server/cache';
import { toMoneyTotals, type MoneyTotal } from '$lib/money';
import { isMoneyMetric } from '$lib/metrics';
import { setting, settingNumber } from '$lib/server/settings';
import { SUPPORTED_STAGES } from '$lib/server/workflow';

/**
 * Impact metrics — computed, never typed in.
 *
 * §4 is explicit that the dashboard must not have a "enter this quarter's
 * numbers" screen as the primary source. Everything here is derived from the
 * case and donation records that already exist, cached into
 * `impact_metrics_cache` so the homepage does not run four aggregate queries
 * per visitor, and overridable through a `site_settings` key for the rare case
 * where staff need to publish a manually-verified figure instead.
 *
 * The precedence, and it matters: **override → cache → live query**. An
 * override is a deliberate editorial act and always wins; a stale cache beats
 * a slow homepage; a live query is the fallback when the cache has never been
 * warmed.
 */

/**
 * Re-exported for the many server callers that already import it from here.
 * The definition moved to `$lib/metrics.ts` so the browser can read it too —
 * the stat-block editor needs to know which metric is money.
 */
export { METRIC, type MetricKey } from '$lib/metrics';
import { METRIC, type MetricKey } from '$lib/metrics';

/** The `site_settings` key that overrides each metric, per §3.1. */
const OVERRIDE_KEY = (metric: MetricKey) => `impact.override_${metric}`;

/**
 * Which currency a money metric's override is denominated in.
 *
 * The override is a bare integer in minor units, and minor units mean nothing
 * without a currency — 150000 is 1,500 birr or 1,500 dollars depending on a
 * fact that used to be assumed rather than stored. Absent or blank falls back
 * to ETB, so an installation that predates this setting publishes what it
 * always did.
 */
const OVERRIDE_CURRENCY_KEY = (metric: MetricKey) => `impact.override_${metric}_currency`;

/**
 * Which pillar feeds the two per-pillar counters.
 *
 * A setting rather than a literal, because `pillars.slug` is editable from
 * Configuration and §0 says nothing a staff member might want to change is
 * hardcoded. This used to be `slug.includes('youth')`, which failed in two
 * directions: renaming `youth-education` to `education` silently published a
 * zero on the homepage with no error anywhere, and a second pillar containing
 * the fragment would have been picked up by whichever sorted first.
 *
 * The fallback is the seeded slug, so an installation that predates the setting
 * keeps working without one.
 */
const PILLAR_METRIC_SOURCE: Record<string, { key: string; fallback: string }> = {
	[METRIC.STUDENTS_SPONSORED]: {
		key: 'impact.pillar_students_sponsored',
		fallback: 'youth-education'
	},
	[METRIC.ELDERS_CARED_FOR]: { key: 'impact.pillar_elders_cared_for', fallback: 'elder-care' }
};

/* ==========================================================================
   Computation
   ========================================================================== */

/** Status ids whose stage counts a case as supported (`active` or `closed`). */
const supportedStatusIds = () =>
	cached('impact:supported-statuses', async () => {
		const rows = await db
			.select({ id: statusOptions.id })
			.from(statusOptions)
			.where(
				and(
					eq(statusOptions.context, 'application'),
					inArray(statusOptions.stage, SUPPORTED_STAGES),
					isNull(statusOptions.deletedAt)
				)
			);
		return rows.map((row) => row.id);
	});

/**
 * Runs every metric query and writes the results into the cache table.
 *
 * Called hourly from `hooks.server.ts` and on demand from the dashboard's
 * "recalculate" button. The write is a single transaction, so a concurrent
 * reader never sees a half-replaced set of counters.
 */
export async function recomputeImpactMetrics(): Promise<{
	counts: Record<string, number>;
	money: Record<string, MoneyTotal[]>;
}> {
	const statusIds = await supportedStatusIds();
	const supported = statusIds.length ? inArray(formSubmissions.statusId, statusIds) : sql`0 = 1`;

	/**
	 * Distinct people, not distinct applications: a family that came back three
	 * times is one family supported.
	 *
	 * Keyed on the beneficiary where the case has been linked to one, and on the
	 * case itself where it has not. `count(distinct beneficiary_id)` alone was
	 * the obvious way to write "distinct people" and undercounts, because SQL
	 * ignores NULLs in a DISTINCT count — so every supported case a caseworker
	 * never pressed "link beneficiary" on contributed nothing at all to the
	 * headline figure on the homepage. An unlinked case counts as one family,
	 * which is the closest true statement available; the prefixes keep a
	 * beneficiary id and a submission id from colliding as the same key.
	 */
	const distinctFamilies = sql<number>`count(distinct coalesce('b' || ${formSubmissions.submittedByBeneficiaryId}, 's' || ${formSubmissions.id}))`;

	const [families, funds, openCases, byPillar] = await Promise.all([
		db
			.select({ value: distinctFamilies })
			.from(formSubmissions)
			.where(and(supported, isNull(formSubmissions.deletedAt))),

		// One row per currency, never one row full stop. The Foundation banks
		// birr locally and dollars from the diaspora, and a bare
		// `sum(donations.amount)` added santim to cents and published the answer
		// with a birr sign in front of it.
		db
			.select({ currency: donations.currency, value: sum(donations.amount) })
			.from(donations)
			.where(and(eq(donations.status, 'completed'), isNull(donations.deletedAt)))
			.groupBy(donations.currency),

		// Contact-form messages carry no pillar and are not cases; counting them
		// as "open" would inflate the number staff use to judge their backlog.
		db
			.select({ value: countDistinct(formSubmissions.id) })
			.from(formSubmissions)
			.where(
				and(
					isNull(formSubmissions.closedAt),
					isNotNull(formSubmissions.pillarId),
					isNull(formSubmissions.deletedAt)
				)
			),

		// Students sponsored and elders cared for are the same query with a
		// different pillar — computing them per pillar means adding a fifth
		// pillar needs no new metric code.
		db
			.select({
				pillarId: formSubmissions.pillarId,
				slug: pillars.slug,
				value: distinctFamilies
			})
			.from(formSubmissions)
			.innerJoin(pillars, eq(pillars.id, formSubmissions.pillarId))
			.where(and(supported, isNull(formSubmissions.deletedAt)))
			.groupBy(formSubmissions.pillarId, pillars.slug)
	]);

	const now = new Date();

	/** The counts. A money metric is not one of these — see `moneyResults`. */
	const results: Record<string, number> = {
		[METRIC.FAMILIES_SUPPORTED]: Number(families[0]?.value ?? 0),
		[METRIC.CASES_OPEN]: Number(openCases[0]?.value ?? 0)
	};

	/** Metric → one total per currency, which is the only honest shape for money. */
	const moneyResults: Record<string, MoneyTotal[]> = {
		[METRIC.FUNDS_RAISED]: toMoneyTotals(funds.map((row) => ({ ...row, amount: row.value })))
	};

	// The slugs that actually exist, to tell a misconfigured counter apart from a
	// correctly-zero one. `byPillar` only carries pillars that have a supported
	// case, so its silence means "none yet" far more often than it means "wrong
	// slug" — warning on that would cry wolf on every fresh installation.
	const livePillarSlugs = new Set(
		(await db.select({ slug: pillars.slug }).from(pillars).where(isNull(pillars.deletedAt))).map(
			(row) => row.slug
		)
	);

	for (const [metric, source] of Object.entries(PILLAR_METRIC_SOURCE)) {
		const slug = (await setting(source.key)).trim() || source.fallback;

		// Loud only when the counter is pointed at a pillar that does not exist —
		// which is what a renamed slug looks like, and what used to publish a zero
		// on the homepage with nothing said anywhere.
		if (!livePillarSlugs.has(slug)) {
			console.warn(
				`impact: no pillar has the slug "${slug}", so ${metric} will publish 0. ` +
					`Set "${source.key}" in Configuration → Site settings to the right slug.`
			);
		}

		results[metric] = Number(byPillar.find((row) => row.slug === slug)?.value ?? 0);
	}

	const rows = [
		...Object.entries(results).map(([key, value]) => ({
			key,
			pillarId: null,
			regionId: null,
			value,
			currency: null,
			computedAt: now
		})),
		/**
		 * A money metric gets one cache row per currency, which is what the
		 * `currency` column on this table was always for. A metric that has taken
		 * nothing yet writes no row at all, and the read path renders that as a
		 * zero rather than inventing a currency to be zero in.
		 */
		...Object.entries(moneyResults).flatMap(([key, totals]) =>
			totals.map((total) => ({
				key,
				pillarId: null,
				regionId: null,
				value: total.amount,
				currency: total.currency,
				computedAt: now
			}))
		),
		...byPillar.map((row) => ({
			key: METRIC.FAMILIES_SUPPORTED,
			pillarId: row.pillarId,
			regionId: null,
			value: Number(row.value ?? 0),
			currency: null,
			computedAt: now
		}))
	];

	/**
	 * Replace rather than upsert.
	 *
	 * An upsert here would have to target the unique index, and SQLite's
	 * NULL-distinct semantics make that index awkward to target from an
	 * `onConflictDoUpdate` — the all-Foundation rows carry nulls in both FK
	 * columns. A delete-then-insert inside one transaction is simpler, is
	 * atomic, and has the useful property of dropping metrics for a pillar
	 * that has since been removed.
	 */
	db.transaction((tx) => {
		tx.delete(impactMetricsCache).run();
		for (const row of rows) tx.insert(impactMetricsCache).values(row).run();
	});

	invalidate('impact');
	return { counts: results, money: moneyResults };
}

/* ==========================================================================
   Reading
   ========================================================================== */

export interface ImpactMetrics {
	/**
	 * Metric key → value, for the metrics that are counts of things.
	 *
	 * A money metric is deliberately absent here. It used to sit alongside the
	 * counts as a single number, which meant every reader had one figure for
	 * "funds raised" and no way to know it was santim and cents added together;
	 * money lives in `money`, one total per currency, so there is nothing to
	 * accidentally print.
	 */
	values: Record<string, number>;
	/** Metric key → one total per currency, in that currency's minor units. */
	money: Record<string, MoneyTotal[]>;
	/** Which keys came from a staff override rather than the live data. */
	overridden: string[];
	computedAt: Date | null;
}

/**
 * Reads the metrics for public display, applying overrides.
 *
 * Never throws and never blocks on a recompute: an empty cache yields zeroes,
 * which render as a counter at zero rather than a broken homepage.
 */
export const getImpactMetrics = (): Promise<ImpactMetrics> =>
	cached(
		'impact:public',
		async () => {
			const rows = await db
				.select({
					key: impactMetricsCache.key,
					value: impactMetricsCache.value,
					currency: impactMetricsCache.currency,
					computedAt: impactMetricsCache.computedAt
				})
				.from(impactMetricsCache)
				.where(isNull(impactMetricsCache.pillarId));

			const values: Record<string, number> = {};
			const moneyRows: Record<string, { currency: string | null; amount: number }[]> = {};
			let computedAt: Date | null = null;
			for (const row of rows) {
				// The `currency` column is what tells the two kinds of row apart —
				// a money metric writes one row per currency, a count writes one
				// row with a null currency.
				if (row.currency) (moneyRows[row.key] ??= []).push({ ...row, amount: row.value });
				else values[row.key] = row.value;
				if (!computedAt || row.computedAt > computedAt) computedAt = row.computedAt;
			}

			const money: Record<string, MoneyTotal[]> = {};
			for (const key of Object.keys(moneyRows)) money[key] = toMoneyTotals(moneyRows[key]);

			const overridden: string[] = [];
			for (const key of Object.values(METRIC)) {
				const override = await settingNumber(OVERRIDE_KEY(key));
				if (override == null) continue;
				overridden.push(key);

				if (isMoneyMetric(key)) {
					/**
					 * An overridden money figure replaces every currency, not just
					 * the one it happens to be in. Staff reaching for the override
					 * are publishing "the figure is this" — leaving the computed
					 * dollars sitting next to a hand-entered birr total would
					 * publish a number nobody chose.
					 */
					const currency = (await setting(OVERRIDE_CURRENCY_KEY(key))).trim() || 'ETB';
					money[key] = [{ currency: currency.toUpperCase(), amount: override }];
				} else {
					values[key] = override;
				}
			}

			return { values, money, overridden, computedAt };
		},
		5 * 60_000
	);

export const invalidateImpact = () => invalidate('impact');

/**
 * Starts the hourly recompute. Called once from `hooks.server.ts`; the timer
 * is unref'd so it never keeps the process alive on shutdown.
 */
export function startImpactSchedule(intervalMs = 60 * 60 * 1000) {
	const run = () =>
		recomputeImpactMetrics().catch((err) => console.error('impact recompute failed', err));

	// Warm on boot, then on the interval. A cold homepage after a deploy would
	// otherwise show zeroes until the first hour elapsed.
	run();
	const timer = setInterval(run, intervalMs);
	timer.unref?.();
	return () => clearInterval(timer);
}
