<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import DataTable from '$lib/components/Table/data-table.svelte';
	import FilterBar from '$lib/dashboard/filter-bar.svelte';
	import TwoLineCell from '$lib/dashboard/two-line-cell.svelte';
	import StatusBadge from '$lib/dashboard/status-badge.svelte';
	import RowLink from '$lib/dashboard/row-link.svelte';
	import { indexColumn } from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import { IN_KIND_STATUS_COLORS, IN_KIND_STATUS_LABELS } from '$lib/inKind';
	import InKindFlagsCell from './in-kind-flags-cell.svelte';
	import { formatDate } from '$lib/dates';

	let { data } = $props();

	let search = $state(data.filters.search);

	/**
	 * Staff wording for how the goods get here. The public form asks the same
	 * question in the donor's voice ("I will bring it"); a coordinator reading a
	 * queue wants the noun.
	 */
	const HANDOVER_LABELS: Record<string, string> = {
		dropoff: 'Drop-off',
		pickup: 'Collection',
		courier: 'Courier',
		already_shipped: 'Shipped'
	};

	const DONOR_TYPE_LABELS: Record<string, string> = {
		individual: 'Individual',
		family: 'Family',
		business: 'Business',
		school: 'School',
		faith_group: 'Faith group',
		association: 'Association',
		ngo: 'Organisation',
		government: 'Government',
		other: 'Other'
	};

	const statusTabs = [
		{ value: 'open', label: 'Open' },
		{ value: 'offered', label: 'New' },
		{ value: 'accepted', label: 'Accepted' },
		{ value: 'scheduled', label: 'Booked in' },
		{ value: 'received', label: 'Received' },
		{ value: 'distributed', label: 'Distributed' },
		{ value: 'declined', label: 'Declined' },
		{ value: 'all', label: 'All' }
	];

	const summary = (status: string) => data.totals.find((row) => row.status === status);

	const openCount = $derived(
		['offered', 'under_review', 'accepted', 'scheduled'].reduce(
			(total, status) => total + Number(summary(status)?.total ?? 0),
			0
		)
	);

	const fmt = (value: Date | string | null) => formatDate(value, '—');

	const donorLabel = (row: (typeof data.rows)[number]) =>
		row.isAnonymous ? 'Anonymous' : (row.organisationName ?? row.donorName);

	const columns = [
		indexColumn,
		{
			id: 'reference',
			header: 'Reference',
			cell: ({ row }: any) =>
				renderComponent(TwoLineCell, {
					primary: row.original.reference,
					secondary: fmt(row.original.createdAt)
				})
		},
		{
			id: 'offer',
			header: 'Offered',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(TwoLineCell, {
					primary: row.original.summary,
					secondary: `${row.original.itemCount} ${row.original.itemCount === 1 ? 'line' : 'lines'} · ${row.original.totalQuantity} in total`
				})
		},
		{
			id: 'donor',
			header: 'From',
			cell: ({ row }: any) =>
				renderComponent(TwoLineCell, {
					primary: donorLabel(row.original),
					secondary: `${DONOR_TYPE_LABELS[row.original.donorType] ?? ''} · ${
						row.original.donorPhone ?? row.original.donorEmail ?? 'no contact'
					}`
				})
		},
		{
			id: 'handover',
			header: 'Handover',
			cell: ({ row }: any) =>
				renderComponent(TwoLineCell, {
					primary: HANDOVER_LABELS[row.original.handoverMethod] ?? row.original.handoverMethod,
					secondary:
						row.original.handoverMethod === 'pickup'
							? (row.original.pickupCity ?? row.original.regionName)
							: null
				})
		},
		{
			id: 'flags',
			header: '',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(InKindFlagsCell, {
					isPerishable: row.original.isPerishable,
					needsColdStorage: row.original.needsColdStorage,
					hasRestrictedItems: row.original.hasRestrictedItems,
					requiresVehicle: row.original.requiresVehicle,
					expiresOn: row.original.expiresOn,
					scheduledFor: row.original.scheduledFor,
					isRead: row.original.isRead,
					today: data.today
				})
		},
		{
			id: 'status',
			header: 'Status',
			cell: ({ row }: any) =>
				renderComponent(StatusBadge, {
					label: IN_KIND_STATUS_LABELS[row.original.status as never],
					color: IN_KIND_STATUS_COLORS[row.original.status as never]
				})
		},
		{
			id: 'open',
			header: '',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(RowLink, { href: `/dashboard/in-kind/${row.original.id}` })
		}
	];
</script>

<svelte:head><title>Gifts in kind · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="font-heading text-2xl font-bold">Gifts in kind</h1>
		<p class="mt-1 max-w-3xl text-sm text-muted-foreground">
			Clothes, food, equipment and donated time offered through the website. Every offer here is
			somebody holding on to something until we call — decide first, then book the collection. An
			estimated value is the donor's own guess and is never counted as money raised.
		</p>
	</div>

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<Card.Root class="p-5">
			<p class="text-xs tracking-wide text-muted-foreground uppercase">Waiting for an answer</p>
			<p class="mt-2 font-heading text-3xl font-semibold">{summary('offered')?.total ?? 0}</p>
			<p class="text-xs text-muted-foreground">{openCount} open in total</p>
		</Card.Root>
		<Card.Root class="p-5">
			<p class="text-xs tracking-wide text-muted-foreground uppercase">Collections due</p>
			<p class="mt-2 font-heading text-3xl font-semibold {data.dueToday ? 'text-warning' : ''}">
				{data.dueToday}
			</p>
			<p class="text-xs text-muted-foreground">Booked for today or overdue</p>
		</Card.Root>
		<Card.Root class="p-5">
			<p class="text-xs tracking-wide text-muted-foreground uppercase">Perishable, unanswered</p>
			<p
				class="mt-2 font-heading text-3xl font-semibold {data.unansweredPerishable
					? 'text-destructive'
					: ''}"
			>
				{data.unansweredPerishable}
			</p>
			<p class="text-xs text-muted-foreground">Food and medicine will not wait</p>
		</Card.Root>
		<Card.Root class="p-5">
			<p class="text-xs tracking-wide text-muted-foreground uppercase">Received</p>
			<p class="mt-2 font-heading text-3xl font-semibold text-success">{data.intake.items}</p>
			<p class="text-xs text-muted-foreground">
				Items counted in, across {data.intake.gifts}
				{data.intake.gifts === 1 ? 'gift' : 'gifts'}
			</p>
		</Card.Root>
	</div>

	<FilterBar
		bind:search
		placeholder="Reference, donor, organisation, what was offered, or town…"
		hasFilters={Boolean(data.filters.search || data.filters.handover || data.filters.perishable)}
	>
		{#snippet children({ applyFilter })}
			{#each statusTabs as tab (tab.value)}
				<Button
					variant={data.filters.status === tab.value ? 'default' : 'outline'}
					size="sm"
					onclick={() => applyFilter('status', tab.value)}
				>
					{tab.label}
				</Button>
			{/each}
			<Button
				variant={data.filters.handover === 'pickup' ? 'default' : 'outline'}
				size="sm"
				onclick={() =>
					applyFilter('handover', data.filters.handover === 'pickup' ? null : 'pickup')}
			>
				Needs collecting
			</Button>
			<Button
				variant={data.filters.perishable ? 'default' : 'outline'}
				size="sm"
				onclick={() => applyFilter('perishable', data.filters.perishable ? null : '1')}
			>
				Perishable
			</Button>
		{/snippet}
	</FilterBar>

	{#if data.rows.length === 0}
		<Card.Root class="p-10 text-center">
			<p class="text-sm text-muted-foreground">
				Nothing here.
				{#if data.filters.status === 'open'}
					Every offer has been answered — which is the state this queue is meant to be in.
				{:else}
					No offers match this filter.
				{/if}
			</p>
		</Card.Root>
	{:else}
		{#key data.rows}
			<DataTable
				{columns}
				data={data.rows}
				search={false}
				fileName="Gifts in kind"
				emptyMessage="Offers of goods and services arrive from the public donate page."
			/>
		{/key}
	{/if}

	<p class="text-xs text-muted-foreground">Showing up to 500 offers, unopened ones first.</p>
</div>
