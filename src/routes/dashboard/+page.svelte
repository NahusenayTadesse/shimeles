<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import StatusBadge from '$lib/dashboard/status-badge.svelte';
	import MoneyTotals from '$lib/dashboard/money-totals.svelte';
	import ChartCanvas from '$lib/components/chart.svelte';
	import {
		ArrowRight,
		ClipboardList,
		HandHeart,
		HeartHandshake,
		Package,
		ScrollText,
		ShieldAlert,
		Wallet
	} from '@lucide/svelte';

	import type { Permission } from '$lib/permissions';
	import { formatDate } from '$lib/dates';

	let { data } = $props();

	const has = (permission: Permission) => data.access.permissions.includes(permission);

	const totalCases = $derived(data.byStatus.reduce((sum, row) => sum + row.total, 0));

	const fmtDate = (value: Date | string | null) => formatDate(value, '');

	/**
	 * What is waiting on the person reading this.
	 *
	 * Built from the counts the layout already fetches for the sidebar badges,
	 * so the queue costs nothing and can never disagree with them. Every line
	 * links to the list already narrowed to what it is counting — the point is
	 * to arrive at the work, not at a screen where you then have to find it.
	 */
	const queue = $derived(
		[
			has('submissions.read') && {
				count: data.counts?.newApplications ?? 0,
				label: 'new applications nobody has opened',
				href: '/dashboard/applications',
				icon: ClipboardList
			},
			has('volunteers.read') && {
				count: data.counts?.newVolunteers ?? 0,
				label: 'new volunteers nobody has opened',
				href: '/dashboard/volunteers',
				icon: HandHeart
			},
			has('volunteers.read') && {
				count: data.volunteersAwaitingSafeguarding,
				label: 'volunteers who cannot be approved until their checklist is done',
				href: '/dashboard/volunteers?blocked=1',
				icon: ShieldAlert
			},
			has('submissions.read') && {
				count: data.counts?.newMessages ?? 0,
				label: 'unread messages',
				href: '/dashboard/messages?unread=1',
				icon: ScrollText
			},
			has('donations.read') && {
				count: data.counts?.pendingDonations ?? 0,
				label: 'transfers waiting to be matched to a donor',
				href: '/dashboard/donations',
				icon: Wallet
			},
			has('inkind.read') && {
				count: data.counts?.newInKind ?? 0,
				label: 'offers of goods nobody has answered',
				href: '/dashboard/in-kind',
				icon: Package
			}
		].filter((row) => row && row.count > 0) as {
			count: number;
			label: string;
			href: string;
			icon: any;
		}[]
	);
</script>

<svelte:head><title>Overview · Dashboard</title></svelte:head>

<div class="flex flex-col gap-6">
	<div>
		<h1 class="font-heading text-2xl font-bold">Overview</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			{#if data.access.pillarIds}
				Showing only the programmes you are assigned to.
			{:else}
				Across every programme.
			{/if}
		</p>
	</div>

	<!--
		The queue comes before the totals. A number tells you how things stand;
		this tells you what is sitting there waiting, and takes you straight to
		it with the filter already applied.
	-->
	<Card.Root class="p-5">
		<h2 class="font-heading text-lg font-semibold">Waiting on you</h2>
		{#if queue.length}
			<div class="mt-3 flex flex-col divide-y">
				{#each queue as row (row.href)}
					<a
						href={row.href}
						class="group flex items-center gap-3 py-2.5 no-underline transition-colors hover:bg-muted/50"
					>
						<row.icon class="size-4 shrink-0 text-muted-foreground" />
						<span class="font-heading text-lg font-semibold tabular-nums">{row.count}</span>
						<span class="min-w-0 flex-1 text-sm text-muted-foreground">{row.label}</span>
						<ArrowRight
							class="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
						/>
					</a>
				{/each}
			</div>
		{:else}
			<p class="mt-2 text-sm text-muted-foreground">
				Nothing is waiting. Everything that has come in has been opened and answered.
			</p>
		{/if}
	</Card.Root>

	<!-- Headline numbers. These come from the impact cache, which is recomputed
	     hourly — never typed in by hand (§4). -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<Card.Root class="p-5">
			<div class="flex items-center gap-2 text-muted-foreground">
				<ClipboardList class="size-4" />
				<span class="text-xs tracking-wide uppercase">Cases</span>
			</div>
			<p class="mt-2 font-heading text-3xl font-semibold">{totalCases}</p>
			<p class="text-xs text-muted-foreground">{data.metrics.cases_open ?? 0} still open</p>
		</Card.Root>

		<Card.Root class="p-5">
			<div class="flex items-center gap-2 text-muted-foreground">
				<HeartHandshake class="size-4" />
				<span class="text-xs tracking-wide uppercase">Families supported</span>
			</div>
			<p class="mt-2 font-heading text-3xl font-semibold">
				{data.metrics.families_supported ?? 0}
			</p>
			<p class="text-xs text-muted-foreground">Distinct people, not applications</p>
		</Card.Root>

		{#if has('donations.read')}
			<Card.Root class="p-5">
				<div class="flex items-center gap-2 text-muted-foreground">
					<Wallet class="size-4" />
					<span class="text-xs tracking-wide uppercase">Raised</span>
				</div>
				<MoneyTotals
					totals={data.metricsMoney.funds_raised ?? []}
					class="mt-2 font-heading text-3xl font-semibold"
				/>
				<p class="text-xs text-muted-foreground">Reconciled gifts only, per currency</p>
			</Card.Root>

			<Card.Root class="p-5">
				<div class="flex items-center gap-2 text-muted-foreground">
					<Wallet class="size-4" />
					<span class="text-xs tracking-wide uppercase">Awaiting matching</span>
				</div>
				<p class="mt-2 font-heading text-3xl font-semibold">{data.pendingDonations.total}</p>
				<div class="text-xs text-muted-foreground">
					<span>Pledged</span>
					<MoneyTotals totals={data.pendingDonations.totals} />
				</div>
			</Card.Root>
		{/if}
	</div>

	<div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
		{#if has('submissions.read')}
			<Card.Root class="p-5">
				<div class="mb-4 flex items-center justify-between gap-2">
					<h2 class="font-heading text-lg font-semibold">Latest applications</h2>
					<a
						href="/dashboard/applications"
						class={buttonVariants({ variant: 'ghost', size: 'sm' })}
					>
						Open the board <ArrowRight class="size-4" />
					</a>
				</div>

				<div class="flex flex-col divide-y">
					{#each data.recent as row (row.id)}
						<a
							href={`/dashboard/applications/${row.id}`}
							class="flex flex-wrap items-center gap-3 py-3 transition-colors hover:bg-muted/50"
						>
							<span class="font-mono text-xs text-muted-foreground">{row.reference}</span>
							<span class="min-w-0 flex-1 truncate font-medium">
								{row.name || 'Anonymous'}
							</span>
							{#if row.pillarName}
								<Badge variant="secondary" class="hidden sm:inline-flex">{row.pillarName}</Badge>
							{/if}
							{#if row.priority === 'urgent' || row.priority === 'high'}
								<Badge variant="destructive" class="capitalize">{row.priority}</Badge>
							{/if}
							<StatusBadge label={row.statusLabel} color={row.statusColor} />
							<span class="text-xs text-muted-foreground">{fmtDate(row.createdAt)}</span>
							{#if !row.isRead}
								<span class="size-2 rounded-full bg-primary" title="Unread"></span>
							{/if}
						</a>
					{:else}
						<p class="py-6 text-center text-sm text-muted-foreground">No applications yet.</p>
					{/each}
				</div>
			</Card.Root>
		{/if}

		<div class="flex flex-col gap-4">
			{#if has('submissions.read')}
				<Card.Root class="p-5">
					<h2 class="mb-3 font-heading text-lg font-semibold">By status</h2>
					<!--
						The ring answers "how much of the board is still waiting" at a
						glance; the list under it keeps the exact figures, which is what
						anybody actually writes down. Neither replaces the other.
					-->
					<ChartCanvas series={data.statusChart} kind="doughnut" height={200} showLegend={false} />
					<div class="mt-3 flex flex-col gap-2">
						{#each data.byStatus as row (row.statusId ?? 'none')}
							<div class="flex items-center justify-between gap-2">
								<StatusBadge label={row.label} color={row.color} />
								<span class="text-sm font-medium">{row.total}</span>
							</div>
						{:else}
							<p class="text-sm text-muted-foreground">Nothing to show yet.</p>
						{/each}
					</div>
				</Card.Root>
			{/if}

			{#if has('volunteers.read')}
				<Card.Root class="p-5">
					<div class="mb-3 flex items-center justify-between gap-2">
						<h2 class="font-heading text-lg font-semibold">Latest volunteers</h2>
						<a
							href="/dashboard/volunteers"
							class={buttonVariants({ variant: 'ghost', size: 'sm' })}
						>
							Open <ArrowRight class="size-4" />
						</a>
					</div>

					<div class="flex flex-col divide-y">
						{#each data.recentVolunteers as row (row.id)}
							<a
								href={`/dashboard/volunteers/${row.id}`}
								class="flex flex-wrap items-center gap-2 py-2.5 no-underline transition-colors hover:bg-muted/50"
							>
								<span class="min-w-0 flex-1 truncate font-medium">{row.fullName}</span>
								{#if !row.safeguardingComplete}
									<!-- The one fact that stops this volunteer being placed. -->
									<ShieldAlert class="size-4 shrink-0 text-muted-foreground" />
								{/if}
								<StatusBadge label={row.statusLabel} color={row.statusColor} />
								{#if !row.isRead}
									<span class="size-2 rounded-full bg-primary" title="Unopened"></span>
								{/if}
							</a>
						{:else}
							<p class="py-6 text-center text-sm text-muted-foreground">No volunteers yet.</p>
						{/each}
					</div>
				</Card.Root>
			{/if}
		</div>
	</div>
</div>
