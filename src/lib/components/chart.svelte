<script lang="ts">
	import {
		ArcElement,
		BarController,
		BarElement,
		CategoryScale,
		Chart,
		DoughnutController,
		Filler,
		Legend,
		LineController,
		LineElement,
		LinearScale,
		PieController,
		PointElement,
		PolarAreaController,
		RadarController,
		RadialLinearScale,
		Tooltip
	} from 'chart.js';
	import { mode } from 'mode-watcher';
	import { readChartTheme, withAlpha } from '$lib/charts/theme';
	import { formatCompact, formatMoney, toMajor } from '$lib/money';
	import type { ChartKind, ChartSeries } from '$lib/charts/types';

	/**
	 * One chart, drawn from a `ChartSeries`.
	 *
	 * Chart.js is registered piece by piece rather than through `registerables`,
	 * so the bundle carries the six shapes this app actually draws and not the
	 * whole library.
	 *
	 * Two things are deliberate and easy to lose in a refactor. The colours are
	 * read from the stylesheet at draw time and re-read when the theme flips,
	 * because Chart.js bakes them into the instance and a chart built in light
	 * mode stays light for ever otherwise. And the numbers are also rendered as
	 * a table: a canvas is invisible to a screen reader and blank without
	 * JavaScript, and a figure a donor cannot read is not a figure.
	 */
	let {
		series,
		kind,
		height = 240,
		showLegend
	}: {
		series: ChartSeries;
		kind: ChartKind;
		height?: number;
		/** Defaults to on for the shapes whose slices need naming. */
		showLegend?: boolean;
	} = $props();

	Chart.register(
		ArcElement,
		BarController,
		BarElement,
		CategoryScale,
		DoughnutController,
		Filler,
		Legend,
		LineController,
		LineElement,
		LinearScale,
		PieController,
		PointElement,
		PolarAreaController,
		RadarController,
		RadialLinearScale,
		Tooltip
	);

	let canvas = $state<HTMLCanvasElement | null>(null);
	let chart: Chart | null = null;

	const isRound = (value: ChartKind) =>
		value === 'pie' || value === 'doughnut' || value === 'polarArea';

	const legendVisible = $derived(showLegend ?? (isRound(kind) || kind === 'radar'));

	/**
	 * Nothing has happened yet.
	 *
	 * An all-zero series draws a labelled grid with no marks on it, which reads
	 * as a broken chart rather than as an honest "none so far" — and a pie of
	 * zeroes is a blank disc. Say it in words instead.
	 */
	const empty = $derived(!series.points.length || series.points.every((point) => !point.value));

	const format = (value: number) =>
		series.currency
			? formatMoney(value, series.currency)
			: `${value.toLocaleString()}${series.unit ? ` ${series.unit}` : ''}`;

	/** Short enough for an axis: "ETB 90k" rather than "ETB 90,000.00". */
	const tick = (value: number) =>
		series.currency
			? `${series.currency} ${formatCompact(toMajor(value, series.currency))}`
			: Number(value).toLocaleString();

	function config() {
		const theme = readChartTheme();
		const colors = series.points.map((point, index) => theme.named(point.color, index));
		const single = theme.palette[0];

		/*
		 * Colour means something or it means nothing.
		 *
		 * A round chart has to tell its slices apart, so it always colours per
		 * point. A bar or line of one series should not: twelve months in twelve
		 * colours says the months are categories that differ, when the whole
		 * point of the chart is that they are the same measure over time. So
		 * bars stay one colour unless the rows carry their own — the programmes
		 * do, and a programme's colour is the same on every screen.
		 */
		const perPoint = isRound(kind) || series.points.some((point) => point.color);
		const fills = perPoint ? colors.map((color) => withAlpha(color, 0.9)) : withAlpha(single, 0.85);

		return {
			type: kind,
			data: {
				labels: series.points.map((point) => point.label),
				datasets: [
					{
						label: series.title,
						data: series.points.map((point) => point.value),
						backgroundColor:
							kind === 'radar' ? withAlpha(single, 0.2) : isRound(kind) ? colors : fills,
						borderColor: isRound(kind) ? theme.surface : single,
						borderWidth: isRound(kind) ? 2 : kind === 'bar' ? 0 : 2,
						borderRadius: kind === 'bar' ? 4 : undefined,
						pointBackgroundColor: single,
						fill: kind === 'line' || kind === 'radar',
						tension: 0.3
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: { duration: 250 },
				plugins: {
					legend: {
						display: legendVisible,
						position: 'bottom' as const,
						labels: { color: theme.text, boxWidth: 10, boxHeight: 10, usePointStyle: true }
					},
					tooltip: {
						callbacks: {
							label: (item: any) => ` ${format(Number(item.raw ?? 0))}`
						}
					}
				},
				scales: isRound(kind)
					? kind === 'polarArea'
						? {
								r: {
									grid: { color: theme.grid },
									angleLines: { color: theme.grid },
									ticks: { display: false }
								}
							}
						: {}
					: kind === 'radar'
						? {
								r: {
									grid: { color: theme.grid },
									angleLines: { color: theme.grid },
									pointLabels: { color: theme.text, font: { size: 11 } },
									ticks: { display: false }
								}
							}
						: {
								x: { grid: { display: false }, ticks: { color: theme.text, font: { size: 11 } } },
								y: {
									beginAtZero: true,
									grid: { color: theme.grid },
									ticks: {
										color: theme.text,
										font: { size: 11 },
										// Counts are whole things. Four cases across a 0–2 axis
										// was drawing ticks at 1.8 and 1.6 of a case.
										precision: series.currency ? undefined : 0,
										callback: (value: any) => tick(Number(value))
									}
								}
							}
			}
		} as any;
	}

	function draw() {
		if (!canvas) return;
		chart?.destroy();
		chart = new Chart(canvas, config());
	}

	$effect(() => {
		// Named so the effect re-runs on any of them: the shape, the numbers,
		// and the theme the colours were read under.
		void kind;
		void series;
		void mode.current;
		if (!empty) draw();
		return () => {
			chart?.destroy();
			chart = null;
		};
	});
</script>

{#if empty}
	<div
		style="height: {height}px"
		class="flex w-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
	>
		Nothing recorded yet.
	</div>
{:else}
	<div style="height: {height}px" class="relative w-full">
		<canvas bind:this={canvas} aria-hidden="true"></canvas>
	</div>
{/if}

<!--
	The same numbers, for anyone the canvas cannot serve. Hidden from sight, not
	from assistive technology — and unhidden entirely when there is no
	JavaScript to draw the canvas in the first place.
-->
<noscript>
	<style>
		.chart-figures {
			position: static !important;
			width: auto !important;
			height: auto !important;
			clip: auto !important;
			white-space: normal !important;
		}
	</style>
</noscript>

<table class="chart-figures sr-only">
	<caption>{series.title}</caption>
	<thead>
		<tr><th scope="col">Name</th><th scope="col">Value</th></tr>
	</thead>
	<tbody>
		{#each series.points as point (point.label)}
			<tr>
				<th scope="row">{point.label}</th>
				<td>{format(point.value)}</td>
			</tr>
		{/each}
	</tbody>
</table>
