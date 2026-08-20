<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import DataTable from '$lib/components/Table/data-table.svelte';
	import FilterBar from '$lib/dashboard/filter-bar.svelte';
	import { column, indexColumn } from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import SubscriberToggle from './subscriber-toggle.svelte';
	import { Mail, MailX } from '@lucide/svelte';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.ok) toast.success(form.message ?? 'Saved');
	});

	let search = $state(data.filters.search);

	const hasFilters = $derived(
		Boolean(data.filters.search || data.filters.source || data.filters.state !== 'active')
	);

	const SOURCE_LABELS: Record<string, string> = {
		homepage: 'Homepage',
		footer: 'Footer',
		donation_flow: 'Donation',
		contact_form: 'Contact form',
		manual: 'Added by staff'
	};

	const fmt = (value: Date | string | null) =>
		value
			? new Intl.DateTimeFormat('en-GB', {
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				}).format(new Date(value))
			: '';

	const columns = [
		indexColumn,
		column('email', 'Email'),
		column('name', 'Name'),
		{
			accessorKey: 'source',
			header: 'Signed up via',
			cell: ({ row }: any) => SOURCE_LABELS[row.original.source] ?? row.original.source
		},
		{
			accessorKey: 'subscribedAt',
			header: 'Subscribed',
			cell: ({ row }: any) => fmt(row.original.subscribedAt)
		},
		{
			accessorKey: 'isActive',
			header: 'Status',
			cell: ({ row }: any) =>
				row.original.isActive ? 'Subscribed' : `Left ${fmt(row.original.unsubscribedAt)}`
		},
		{
			id: 'actions',
			header: '',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(SubscriberToggle, {
					id: row.original.id,
					isActive: row.original.isActive
				})
		}
	];
</script>

<svelte:head><title>Newsletter · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="font-heading text-2xl font-bold">Newsletter</h1>
		<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
			Everyone who has opted in, and where they opted in from. There is no way to add someone here
			on purpose — an address nobody opted in is not a subscriber. Use Export to get the list for
			your mail tool.
		</p>
	</div>

	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
		<Card.Root class="p-5">
			<p class="text-xs tracking-wide text-muted-foreground uppercase">Subscribed</p>
			<p class="mt-1 font-heading text-2xl font-bold">{data.totals.active.toLocaleString()}</p>
		</Card.Root>
		<Card.Root class="p-5">
			<p class="text-xs tracking-wide text-muted-foreground uppercase">Ever signed up</p>
			<p class="mt-1 font-heading text-2xl font-bold">{data.totals.total.toLocaleString()}</p>
		</Card.Root>
		{#each data.bySource.slice(0, 2) as entry (entry.source)}
			<Card.Root class="p-5">
				<p class="text-xs tracking-wide text-muted-foreground uppercase">
					{SOURCE_LABELS[entry.source] ?? entry.source}
				</p>
				<p class="mt-1 font-heading text-2xl font-bold">{entry.total.toLocaleString()}</p>
			</Card.Root>
		{/each}
	</div>

	<FilterBar bind:search placeholder="Email or name…" {hasFilters}>
		{#snippet children({ applyFilter })}
			<Button
				variant={data.filters.state === 'active' ? 'default' : 'outline'}
				size="sm"
				onclick={() => applyFilter('state', null)}
			>
				<Mail class="size-4" /> Subscribed
			</Button>
			<Button
				variant={data.filters.state === 'unsubscribed' ? 'default' : 'outline'}
				size="sm"
				onclick={() => applyFilter('state', 'unsubscribed')}
			>
				<MailX class="size-4" /> Unsubscribed
			</Button>
			<Button
				variant={data.filters.state === 'all' ? 'default' : 'outline'}
				size="sm"
				onclick={() => applyFilter('state', 'all')}
			>
				All
			</Button>

			{#each Object.entries(SOURCE_LABELS) as [value, label] (value)}
				<Button
					variant={data.filters.source === value ? 'default' : 'outline'}
					size="sm"
					onclick={() => applyFilter('source', data.filters.source === value ? null : value)}
				>
					{label}
				</Button>
			{/each}
		{/snippet}
	</FilterBar>

	{#key data.rows}
		<DataTable {columns} data={data.rows} search={false} fileName="Newsletter subscribers" />
	{/key}
</div>
