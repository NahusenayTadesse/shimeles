<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import MoneyTotals from '$lib/dashboard/money-totals.svelte';
	import { Info, RefreshCw } from '@lucide/svelte';
	import { formatDateTime } from '$lib/dates';
	import { page } from '$app/state';
	import ChartCanvas from '$lib/components/chart.svelte';
	import ChartSwitcher from '$lib/charts/chart-switcher.svelte';
	import { resolveKind, type ChartSeries } from '$lib/charts/types';

	let { data, form } = $props();

	$effect(() => {
		if (form?.ok) toast.success('Recomputed');
	});

	const headline = [
		{ key: 'families_supported', label: 'Families supported' },
		{ key: 'students_sponsored', label: 'Students sponsored' },
		{ key: 'elders_cared_for', label: 'Elders cared for' },
		{ key: 'cases_open', label: 'Cases still open' }
	];

	/**
	 * The shape each chart is currently drawn as.
	 *
	 * Read from the URL rather than held in state, so a link to this screen
	 * carries the view somebody chose — and so the back button undoes a change
	 * of shape like it undoes everything else here.
	 */
	const kindOf = (series: ChartSeries) => resolveKind(series, page.url.searchParams.get(series.id));

	const fmt = (value: Date | string | null) => formatDateTime(value, 'never');
</script>

<svelte:head><title>Impact · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="font-heading text-2xl font-bold">Impact</h1>
			<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
				Computed from the case and donation records, not typed in. Last recalculated {fmt(
					data.computedAt
				)}.
			</p>
		</div>
		<form method="post" action="?/recompute" use:enhance>
			<Button type="submit" variant="outline" size="sm">
				<RefreshCw class="size-4" /> Recalculate now
			</Button>
		</form>
	</div>

	{#if data.overrideLabels.length}
		<Alert.Root>
			<Info class="size-4" />
			<Alert.Title>Some figures are being overridden</Alert.Title>
			<Alert.Description>
				{data.overrideLabels.join(', ')}. The public site shows the manually entered value instead
				of the computed one. Clear the setting to go back to the live count.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each headline as stat (stat.key)}
			<Card.Root class="p-5">
				<div class="flex items-start justify-between gap-2">
					<span class="text-xs tracking-wide text-muted-foreground uppercase">{stat.label}</span>
					{#if data.overridden.includes(stat.key)}
						<Badge variant="outline" class="h-4 px-1.5 text-[10px]">Overridden</Badge>
					{/if}
				</div>
				<p class="mt-2 font-heading text-3xl font-semibold">{data.metrics[stat.key] ?? 0}</p>
			</Card.Root>
		{/each}
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		<Card.Root class="p-5">
			<h2 class="mb-4 font-heading text-lg font-semibold">Money</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<p class="text-xs tracking-wide text-muted-foreground uppercase">Raised (confirmed)</p>
					<MoneyTotals
						totals={data.metricsMoney.funds_raised ?? []}
						class="mt-1 font-heading text-2xl font-semibold text-success"
					/>
				</div>
				<div>
					<p class="text-xs tracking-wide text-muted-foreground uppercase">Disbursed</p>
					<MoneyTotals
						totals={data.disbursed.totals}
						class="mt-1 font-heading text-2xl font-semibold"
					/>
					<p class="text-xs text-muted-foreground">across {data.disbursed.count} payments</p>
				</div>
			</div>

			{#if data.charts.givingByMonth.length}
				<!--
					One chart per currency, never one across them. There is no shared
					scale between santim and cents, so a single series summing both
					would be measuring nothing — and each currency read on its own is
					the question anybody actually asks of this panel.
				-->
				<div class="mt-6 flex flex-col gap-6">
					{#each data.charts.givingByMonth as series (series.id)}
						<div>
							<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
								<p class="text-xs tracking-wide text-muted-foreground uppercase">
									{series.title}
								</p>
								<ChartSwitcher {series} />
							</div>
							<ChartCanvas {series} kind={kindOf(series)} height={200} />
						</div>
					{/each}
				</div>
			{/if}
		</Card.Root>

		<Card.Root class="flex flex-col gap-6 p-5">
			<!--
				Cases and people are two different questions of the same programmes —
				a programme can carry many cases for few people, or the reverse, and
				that gap is the interesting part. Both offer every shape the numbers
				can bear, because a handful of programmes summing to a whole is the
				one dataset here that genuinely reads as a pie or a radar.
			-->
			<div>
				<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
					<h2 class="font-heading text-lg font-semibold">Cases by programme</h2>
					<ChartSwitcher series={data.charts.casesByPillar} />
				</div>
				<ChartCanvas series={data.charts.casesByPillar} kind={kindOf(data.charts.casesByPillar)} />
			</div>

			<div>
				<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
					<h2 class="font-heading text-lg font-semibold">People reached</h2>
					<ChartSwitcher series={data.charts.peopleByPillar} />
				</div>
				<ChartCanvas
					series={data.charts.peopleByPillar}
					kind={kindOf(data.charts.peopleByPillar)}
				/>
			</div>

			{#if data.charts.casesByRegion.points.length}
				<!--
					Regions are a long tail: a dozen slices is an unreadable pie and a
					worse radar, so this one is bars and stays bars.
				-->
				<div>
					<h2 class="mb-3 font-heading text-lg font-semibold">Cases by region</h2>
					<ChartCanvas series={data.charts.casesByRegion} kind="bar" height={200} />
				</div>
			{/if}
		</Card.Root>
	</div>

	<Card.Root class="p-5">
		<h2 class="mb-2 font-heading text-base font-semibold">How these are worked out</h2>
		<ul class="flex flex-col gap-1 text-sm text-muted-foreground">
			<li>
				<strong>Families supported</strong>: distinct people with at least one case that reached
				"receiving support" or "closed". A family that came back three times counts once.
			</li>
			<li>
				<strong>Students sponsored</strong> and <strong>elders cared for</strong>: the same count,
				narrowed to the Youth & Education and Elder Care programmes.
			</li>
			<li>
				<strong>Raised</strong>: confirmed donations only. A pledge sitting in the reconciliation
				queue is not money and is not counted.
			</li>
		</ul>
	</Card.Root>
</div>
