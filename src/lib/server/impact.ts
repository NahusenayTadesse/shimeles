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
import { settingNumber } from '$lib/server/settings';
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

export const METRIC = {
	FAMILIES_SUPPORTED: 'families_supported',
	STUDENTS_SPONSORED: 'students_sponsored',
	ELDERS_CARED_FOR: 'elders_cared_for',
	FUNDS_RAISED: 'funds_raised',
	VOLUNTEERS_ACTIVE: 'volunteers_active',
	CASES_OPEN: 'cases_open'
} as const;

export type MetricKey = (typeof METRIC)[keyof typeof METRIC];

/** The `site_settings` key that overrides each metric, per §3.1. */
const OVERRIDE_KEY = (metric: MetricKey) => `impact.override_${metric}`;

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
export async function recomputeImpactMetrics(): Promise<Record<MetricKey, number>> {
	const statusIds = await supportedStatusIds();
	const supported = statusIds.length ? inArray(formSubmissions.statusId, statusIds) : sql`0 = 1`;

	const [families, funds, openCases, byPillar] = await Promise.all([
		// Distinct people, not distinct applications: a family that came back
		// three times is one family supported.
		db
			.select({ value: countDistinct(formSubmissions.submittedByBeneficiaryId) })
			.from(formSubmissions)
			.where(and(supported, isNull(formSubmissions.deletedAt))),

		db
			.select({ value: sum(donations.amount) })
			.from(donations)
			.where(and(eq(donations.status, 'completed'), isNull(donations.deletedAt))),

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
				value: countDistinct(formSubmissions.submittedByBeneficiaryId)
			})
			.from(formSubmissions)
			.innerJoin(pillars, eq(pillars.id, formSubmissions.pillarId))
			.where(and(supported, isNull(formSubmissions.deletedAt)))
			.groupBy(formSubmissions.pillarId, pillars.slug)
	]);

	const now = new Date();
	const results: Record<string, number> = {
		[METRIC.FAMILIES_SUPPORTED]: Number(families[0]?.value ?? 0),
		[METRIC.FUNDS_RAISED]: Number(funds[0]?.value ?? 0),
		[METRIC.CASES_OPEN]: Number(openCases[0]?.value ?? 0)
	};

	const forPillar = (slugFragment: string) =>
		Number(byPillar.find((row) => row.slug.includes(slugFragment))?.value ?? 0);

	results[METRIC.STUDENTS_SPONSORED] = forPillar('youth');
	results[METRIC.ELDERS_CARED_FOR] = forPillar('elder');

	const rows = [
		...Object.entries(results).map(([key, value]) => ({
			key,
			pillarId: null,
			regionId: null,
			value,
			currency: key === METRIC.FUNDS_RAISED ? 'ETB' : null,
			computedAt: now
		})),
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
	return results as Record<MetricKey, number>;
}

/* ==========================================================================
   Reading
   ========================================================================== */

export interface ImpactMetrics {
	/** Metric key → value. `funds_raised` is in ETB santim, like every amount. */
	values: Record<string, number>;
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
					computedAt: impactMetricsCache.computedAt
				})
				.from(impactMetricsCache)
				.where(isNull(impactMetricsCache.pillarId));

			const values: Record<string, number> = {};
			let computedAt: Date | null = null;
			for (const row of rows) {
				values[row.key] = row.value;
				if (!computedAt || row.computedAt > computedAt) computedAt = row.computedAt;
			}

			const overridden: string[] = [];
			for (const key of Object.values(METRIC)) {
				const override = await settingNumber(OVERRIDE_KEY(key));
				if (override != null) {
					values[key] = override;
					overridden.push(key);
				}
			}

			return { values, overridden, computedAt };
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
