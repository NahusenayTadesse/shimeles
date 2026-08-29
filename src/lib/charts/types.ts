/**
 * The chart contract.
 *
 * One shape, produced on the server, rendered the same way in the dashboard
 * and on the public site. A new chart is a query that returns this and a line
 * of markup — not another charting decision.
 *
 * The important field is `kinds`. A chart type is not a free choice over
 * arbitrary numbers: a pie is parts of one whole, a radar needs three or more
 * axes on one comparable scale, a line needs ordered time. Letting somebody
 * pick "pie" for twelve months of giving in three currencies draws a picture
 * of nothing and reads as authoritative while doing it. So the data declares
 * what it can honestly be, and the switcher offers only that.
 */

export const CHART_KINDS = ['bar', 'line', 'doughnut', 'pie', 'radar', 'polarArea'] as const;

export type ChartKind = (typeof CHART_KINDS)[number];

export type ChartPoint = {
	label: string;
	value: number;
	/** A brand token name — `clay`, `olive`, `plum`, `sky` — where the row owns one. */
	color?: string | null;
};

export type ChartSeries = {
	/** Stable id. Doubles as the URL parameter the switcher writes to. */
	id: string;
	title: string;
	/** Set when the values are money in this currency's minor unit. */
	currency?: string;
	/** What one value is, for the tooltip: "cases", "people". Ignored for money. */
	unit?: string;
	/** The shapes this data can honestly take, best first. */
	kinds: ChartKind[];
	points: ChartPoint[];
};

export const KIND_LABELS: Record<ChartKind, string> = {
	bar: 'Bars',
	line: 'Line',
	doughnut: 'Doughnut',
	pie: 'Pie',
	radar: 'Radar',
	polarArea: 'Polar'
};

/**
 * Which shapes a set of points can bear, given only the data.
 *
 * Used by the server builders so the rule lives in one place rather than being
 * re-decided per screen.
 *
 * - Parts of a whole need every value to be non-negative and at least one of
 *   them to be above zero; a pie of all-zeroes is a blank disc, and a pie
 *   containing a negative is a lie about the geometry.
 * - Radar needs three axes to be a shape at all, and stops being readable
 *   somewhere around eight.
 * - A single point is a number, not a chart, and reads better as one.
 */
export function kindsFor(
	points: ChartPoint[],
	options: { ordered?: boolean; comparable?: boolean } = {}
): ChartKind[] {
	const { ordered = false, comparable = true } = options;
	if (points.length < 2) return ['bar'];

	const kinds: ChartKind[] = ['bar'];
	if (ordered) kinds.push('line');

	const partsOfAWhole =
		!ordered && comparable && points.every((p) => p.value >= 0) && points.some((p) => p.value > 0);

	if (partsOfAWhole) kinds.push('doughnut', 'pie');
	if (partsOfAWhole && points.length >= 3 && points.length <= 8) kinds.push('radar', 'polarArea');

	return kinds;
}

/** The requested shape if this data can bear it, otherwise the data's own first choice. */
export function resolveKind(
	series: Pick<ChartSeries, 'kinds'>,
	requested?: string | null
): ChartKind {
	const fallback = series.kinds[0] ?? 'bar';
	if (!requested) return fallback;
	return (series.kinds as string[]).includes(requested) ? (requested as ChartKind) : fallback;
}
