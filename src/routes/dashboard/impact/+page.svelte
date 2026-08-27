<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { formatMoney } from '$lib/money';
	import MoneyTotals from '$lib/dashboard/money-totals.svelte';
	import { Info, RefreshCw } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import { formatDateTime, formatMonth } from '$lib/dates';

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
	 * The chart is one bar per currency per month, not one bar per month.
	 *
	 * Heights are a share of that currency's own biggest month, because there is
	 * no shared scale between santim and cents to draw them against — a single
	 * bar summing both was measuring nothing. Each currency therefore reads as
	 * its own trend line, which is the question the chart is actually asked.
	 */
	const currencies = $derived([
		...new Set(data.monthly.flatMap((row) => row.totals.map((total) => total.currency)))
	]);

	const peaks = $derived(
		new Map(
			currencies.map((currency) => [
				currency,
				Math.max(
					1,
					...data.monthly.map(
						(row) => row.totals.find((total) => total.currency === currency)?.amount ?? 0
					)
				)
			])
		)
	);

	const amountIn = (row: (typeof data.monthly)[number], currency: string) =>
		row.totals.find((total) => total.currency === currency)?.amount ?? 0;

	/** Stable per-currency colour, so a bar means the same thing across months. */
	const currencyBar = (currency: string) =>
		['bg-primary/80', 'bg-olive/80', 'bg-plum/80', 'bg-sky/80'][currencies.indexOf(currency) % 4];

	const accent = (color: string) =>
		({ clay: 'bg-clay', olive: 'bg-olive', plum: 'bg-plum', sky: 'bg-sky' })[color] ?? 'bg-primary';

	const monthLabel = (month: string) => {
		const [year, m] = month.split('-');
		// Just the month: the chart's own axis carries the year.
		return formatMonth(new Date(Number(year), Number(m) - 1, 1)).split(' ')[0];
	};

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

			{#if data.monthly.length}
				<div class="mt-6">
					<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							Confirmed giving by month
						</p>
						<!-- Each currency is scaled to its own best month, so the legend has
						     to say which bar is which; heights are not comparable across
						     currencies and the chart does not pretend they are. -->
						<div class="flex flex-wrap items-center gap-3">
							{#each currencies as currency (currency)}
								<span class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
									<span class="size-2 rounded-full {currencyBar(currency)}"></span>
									{currency}
								</span>
							{/each}
						</div>
					</div>
					<div class="flex h-32 items-end gap-1.5">
						{#each data.monthly as row (row.month)}
							<div class="flex flex-1 flex-col items-center gap-1">
								<div class="flex h-full w-full items-end justify-center gap-0.5">
									{#each currencies as currency (currency)}
										{@const amount = amountIn(row, currency)}
										<div
											class="flex-1 rounded-t {currencyBar(currency)}"
											style={`height: ${Math.max(4, (amount / (peaks.get(currency) ?? 1)) * 100)}%`}
											title={`${row.month}: ${formatMoney(amount, currency)}`}
										></div>
									{/each}
								</div>
								<span class="text-[10px] text-muted-foreground">{monthLabel(row.month)}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</Card.Root>

		<Card.Root class="p-5">
			<h2 class="mb-4 font-heading text-lg font-semibold">By programme</h2>
			<div class="flex flex-col gap-3">
				{#each data.byPillar as row (row.pillarId)}
					<div>
						<div class="mb-1 flex items-center justify-between gap-2 text-sm">
							<span class="font-medium">{row.name}</span>
							<span class="text-muted-foreground">
								{row.cases}
								{row.cases === 1 ? 'case' : 'cases'} · {row.people} people
							</span>
						</div>
						<div class="h-2 overflow-hidden rounded-full bg-muted">
							<div
								class={cn('h-full rounded-full', accent(row.color))}
								style={`width: ${Math.min(100, (row.cases / Math.max(1, ...data.byPillar.map((p) => p.cases))) * 100)}%`}
							></div>
						</div>
					</div>
				{/each}
			</div>

			<h2 class="mt-6 mb-3 font-heading text-lg font-semibold">By region</h2>
			<div class="flex flex-col gap-2 text-sm">
				{#each data.byRegion as row (row.name)}
					<div class="flex items-center justify-between gap-2">
						<span>{row.name}</span>
						<span class="text-muted-foreground">{row.cases}</span>
					</div>
				{/each}
			</div>
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
