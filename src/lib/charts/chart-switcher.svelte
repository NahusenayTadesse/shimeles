<script lang="ts">
	import { page } from '$app/state';
	import { applyFilter } from '$lib/dashboard/apply-filter';
	import { KIND_LABELS, resolveKind, type ChartSeries } from '$lib/charts/types';
	import { cn } from '$lib/utils';

	/**
	 * The shape picker.
	 *
	 * The choice goes in the URL, like every other filter in the dashboard, so a
	 * chart somebody found useful is a link they can send. `series.id` is the
	 * parameter, so two charts on one screen never fight over it.
	 *
	 * It offers only the shapes the data declared. A radar of two values or a
	 * pie of a time series are not options withheld for tidiness — they would
	 * be pictures that misrepresent the numbers behind them.
	 */
	let { series }: { series: ChartSeries } = $props();

	const current = $derived(resolveKind(series, page.url.searchParams.get(series.id)));
</script>

{#if series.kinds.length > 1}
	<div
		role="group"
		aria-label="How to draw {series.title}"
		class="flex flex-wrap items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5"
	>
		{#each series.kinds as kind (kind)}
			<button
				type="button"
				aria-pressed={current === kind}
				onclick={() =>
					applyFilter(page.url, series.id, kind === series.kinds[0] ? null : kind, {
						// Redrawing the same numbers is not a new result set, so the
						// list underneath keeps its place.
						resetsPage: false
					})}
				class={cn(
					'rounded-md px-2 py-1 text-[11px] transition-colors',
					current === kind
						? 'bg-background font-medium text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'
				)}
			>
				{KIND_LABELS[kind]}
			</button>
		{/each}
	</div>
{/if}
