<script lang="ts">
	import { goto } from '$app/navigation';
	import { page as pageState } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import DataTable from '$lib/components/Table/data-table.svelte';
	import FilterBar from '$lib/dashboard/filter-bar.svelte';
	import BadgeCell from '$lib/dashboard/badge-cell.svelte';
	import { indexColumn } from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import { ScrollText } from '@lucide/svelte';

	let { data } = $props();

	let search = $state(data.filters.search);

	/** Mirrors `FilterBar`'s own `applyFilter` (same URL + page-reset rules) for
	    the action-type buttons below, which render outside the filter bar. */
	function applyFilter(key: string, value: string | null) {
		const url = new URL(pageState.url);
		if (value === null || value === '') url.searchParams.delete(key);
		else url.searchParams.set(key, value);
		url.searchParams.delete('page');
		goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
	}

	function goToPage(next: number) {
		const url = new URL(pageState.url);
		url.searchParams.set('page', String(next));
		goto(`${url.pathname}${url.search}`);
	}

	const actions = [
		'viewed',
		'viewed_list',
		'created',
		'updated',
		'deleted',
		'updated_status',
		'reconciled',
		'downloaded_document',
		'permission_denied',
		'login'
	];

	const ranges = [
		{ value: '7', label: '7 days' },
		{ value: '30', label: '30 days' },
		{ value: '90', label: '90 days' },
		{ value: '3650', label: 'Everything' }
	];

	/** Sensitive actions get visual weight — they are why this screen exists. */
	const tone = (action: string) =>
		action === 'permission_denied'
			? 'destructive'
			: action === 'downloaded_document' || action === 'viewed'
				? 'secondary'
				: 'outline';

	const fmt = (value: Date | string | null) =>
		value
			? new Intl.DateTimeFormat('en-GB', {
					day: 'numeric',
					month: 'short',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit'
				}).format(new Date(value))
			: '';

	const hasFilters = $derived(
		Boolean(data.filters.action || data.filters.entityType || data.filters.search)
	);

	const columns = [
		indexColumn,
		{
			id: 'createdAt',
			header: 'When',
			cell: ({ row }: any) => fmt(row.original.createdAt)
		},
		{
			id: 'who',
			header: 'Who',
			enableSorting: false,
			cell: ({ row }: any) =>
				`${row.original.userName ?? 'Public visitor'}${row.original.ipAddress ? ` (${row.original.ipAddress})` : ''}`
		},
		{
			id: 'action',
			header: 'Did what',
			cell: ({ row }: any) =>
				renderComponent(BadgeCell, {
					label: row.original.action.replace(/_/g, ' '),
					variant: tone(row.original.action)
				})
		},
		{
			id: 'entity',
			header: 'To',
			enableSorting: false,
			cell: ({ row }: any) =>
				`${row.original.entityType.replace(/_/g, ' ')}${row.original.entityId ? ` #${row.original.entityId}` : ''}`
		},
		{
			id: 'metadata',
			header: 'Detail',
			enableSorting: false,
			cell: ({ row }: any) => (row.original.metadata ? JSON.stringify(row.original.metadata) : '')
		}
	];
</script>

<svelte:head><title>Audit log · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="font-heading text-2xl font-bold">Audit log</h1>
		<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
			Who looked at what, and who changed what.
		</p>
	</div>

	<Alert.Root>
		<ScrollText class="size-4" />
		<Alert.Description>
			Reads are logged as well as writes. This system holds medical and mental-health-adjacent
			information, and "who opened this case file" is a question that has to be answerable. Nothing
			on this screen can be edited or deleted.
		</Alert.Description>
	</Alert.Root>

	<FilterBar bind:search placeholder="Staff name or record id…" {hasFilters} resetsPage>
		{#snippet children({ applyFilter })}
			{#each ranges as range (range.value)}
				<Button
					variant={String(data.filters.days) === range.value ? 'default' : 'outline'}
					size="sm"
					onclick={() => applyFilter('days', range.value)}
				>
					{range.label}
				</Button>
			{/each}
		{/snippet}
	</FilterBar>

	<div class="flex flex-wrap gap-1">
		{#each actions as action (action)}
			<Button
				variant={data.filters.action === action ? 'default' : 'ghost'}
				size="sm"
				class="h-7 text-xs"
				onclick={() => applyFilter('action', data.filters.action === action ? null : action)}
			>
				{action.replace(/_/g, ' ')}
			</Button>
		{/each}
	</div>

	{#key data.rows}
		<DataTable {columns} data={data.rows} search={false} fileName="Audit log" />
	{/key}

	{#if data.page > 1 || data.hasMore}
		<div class="flex items-center justify-between gap-2">
			<Button
				variant="outline"
				size="sm"
				disabled={data.page <= 1}
				onclick={() => goToPage(data.page - 1)}
			>
				Previous
			</Button>
			<span class="text-sm text-muted-foreground">Page {data.page}</span>
			<Button
				variant="outline"
				size="sm"
				disabled={!data.hasMore}
				onclick={() => goToPage(data.page + 1)}
			>
				Next
			</Button>
		</div>
	{/if}
</div>
