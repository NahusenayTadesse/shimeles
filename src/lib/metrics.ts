/**
 * The impact metrics, in a module both sides can import.
 *
 * These used to live only in `$lib/server/impact.ts`, so the browser had no
 * way to know which metric is money — and a stat block therefore carried an
 * `is_money` flag that a staff member typed by hand into a JSON textarea. Get
 * it wrong on `funds_raised`, which is stored in santim, and the homepage
 * publishes a hundredfold overstatement of money raised with no error
 * anywhere. `1234567` renders as `ETB 12,345.67` with the flag and `1.2M`
 * without it.
 *
 * A fact about a metric should not be re-entered per block. It is derived
 * here, once, and both the editor and the renderer read it from the metric
 * rather than from the stored content.
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

/** What a staff member should see in a dropdown, rather than the raw key. */
export const METRIC_LABELS: Record<MetricKey, string> = {
	[METRIC.FAMILIES_SUPPORTED]: 'Families supported',
	[METRIC.STUDENTS_SPONSORED]: 'Students sponsored',
	[METRIC.ELDERS_CARED_FOR]: 'Elders cared for',
	[METRIC.FUNDS_RAISED]: 'Funds raised',
	[METRIC.VOLUNTEERS_ACTIVE]: 'Active volunteers',
	[METRIC.CASES_OPEN]: 'Open cases'
};

/**
 * The metrics held in minor units and shown as currency.
 *
 * Exactly one today. `impact.ts` already knows it — it writes
 * `currency: 'ETB'` on this row and null on every other.
 */
const MONEY_METRICS = new Set<string>([METRIC.FUNDS_RAISED]);

export const isMoneyMetric = (metric: string | null | undefined): boolean =>
	MONEY_METRICS.has(String(metric ?? ''));

export const isMetricKey = (value: unknown): value is MetricKey =>
	typeof value === 'string' && Object.values(METRIC).includes(value as MetricKey);

/** One counter in a `stat_counter` block. The number is always computed, never stored. */
export interface StatEntry {
	metric: MetricKey;
	/** Overrides `METRIC_LABELS` when a page wants its own wording. */
	label: string;
	/** A trailing "+" or "%" on a non-money counter. */
	suffix?: string;
}
