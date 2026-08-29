/**
 * Chart colours, taken from the stylesheet rather than written down again.
 *
 * The palette is `--chart-1` to `--chart-5`, which already exist in both light
 * and dark and are already the brand anchors — clay, olive, plum, sky. Reading
 * them here means a chart follows a theme edit for free, and can never drift
 * from the rest of the page.
 *
 * Every value is normalised through a canvas first. The tokens are `oklch()`,
 * and while a canvas can parse that, nothing can derive a translucent variant
 * from the string without re-implementing the colour space. Handing the string
 * to a context and reading it back gives hex, which alpha is trivial from.
 */

const FALLBACK = '#0e3b2e';

let probe: CanvasRenderingContext2D | null | undefined;

function context() {
	if (probe !== undefined) return probe;
	probe =
		typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
	return probe;
}

/** Any CSS colour the browser can parse, as `#rrggbb`. */
export function toHex(color: string): string {
	const ctx = context();
	if (!ctx || !color) return FALLBACK;
	try {
		ctx.fillStyle = '#000';
		ctx.fillStyle = color;
		const parsed = ctx.fillStyle;
		return typeof parsed === 'string' ? parsed : FALLBACK;
	} catch {
		return FALLBACK;
	}
}

export function withAlpha(hex: string, alpha: number): string {
	const value = toHex(hex);
	if (!value.startsWith('#') || value.length !== 7) return value;
	const r = parseInt(value.slice(1, 3), 16);
	const g = parseInt(value.slice(3, 5), 16);
	const b = parseInt(value.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function token(name: string, fallback: string): string {
	if (typeof document === 'undefined') return fallback;
	const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return raw ? toHex(raw) : fallback;
}

export type ChartTheme = {
	/** The categorical ramp, in order. */
	palette: string[];
	/** Axis labels, tick text, legend text. */
	text: string;
	/** Grid lines and the chart's own borders. */
	grid: string;
	/** Whatever the chart is drawn on, for arc borders that need to read as gaps. */
	surface: string;
	/** A named brand colour, for rows that carry one. */
	named: (name?: string | null, index?: number) => string;
};

/** Read once per render; call again when the theme changes. */
export function readChartTheme(): ChartTheme {
	const palette = [
		token('--chart-1', '#0e3b2e'),
		token('--chart-2', '#6b7a3a'),
		token('--chart-3', '#6b3a5a'),
		token('--chart-4', '#3a6b7a'),
		token('--chart-5', '#c98a2b')
	];

	/*
	 * Rows store a colour *name* — staff pick "olive" from a dropdown and never
	 * type a hex — so a chart has to resolve the same vocabulary the badges do.
	 * This is the list in `status-badge.svelte`, which is where a programme's
	 * colour and a status's colour both come from: an approved case is the same
	 * green in a badge and in a doughnut, or the chart is a second opinion.
	 */
	const byName: Record<string, string> = {
		clay: palette[0],
		olive: palette[1],
		plum: palette[2],
		sky: palette[3],
		amber: token('--warning', palette[4]),
		rose: token('--destructive', '#b3261e'),
		green: token('--success', '#2f7d4f'),
		slate: token('--muted-foreground', '#6b7280')
	};

	return {
		palette,
		text: token('--muted-foreground', '#6b7280'),
		grid: withAlpha(token('--border', '#d4d4d8'), 0.6),
		surface: token('--card', '#ffffff'),
		named: (name, index = 0) => byName[name ?? ''] ?? palette[index % palette.length]
	};
}
