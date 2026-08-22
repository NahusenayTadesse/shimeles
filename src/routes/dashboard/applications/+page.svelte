<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import DataTable from '$lib/components/Table/data-table.svelte';
	import FilterBar from '$lib/dashboard/filter-bar.svelte';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import StatusBadge from '$lib/dashboard/status-badge.svelte';
	import OpenLinkCell from '$lib/dashboard/open-link-cell.svelte';
	import ApplicationNameCell from './application-name-cell.svelte';
	import { indexColumn } from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import { Columns3, Inbox, Table2 } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import { formatDateShort } from '$lib/dates';

	let { data } = $props();

	/**
	 * Board and table are two views of one dataset. The board groups by
	 * `status_options.stage` — the code-level category — rather than by label, so
	 * renaming a status in the dashboard reorders nothing and breaks nothing.
	 */
	let view = $state<'board' | 'table'>('board');
	let search = $state(data.filters.search);

	const needItems = $derived([
		{ value: '', name: 'Any kind of help' },
		...data.needOptions.map((need) => ({ value: String(need.id), name: need.name }))
	]);

	const untriagedCount = $derived(data.rows.filter((row) => !row.pillarId).length);

	const boardColumns = $derived(
		data.statuses.map((status) => ({
			...status,
			cards: data.rows.filter((row) => row.statusId === status.id)
		}))
	);

	const unassigned = $derived(data.rows.filter((row) => row.statusId == null));

	const priorityRank: Record<string, number> = {
		urgent: 0,
		high: 1,
		normal: 2,
		low: 3,
		// Deferred sorts below everything: the case is open and still assessed,
		// it just is not what anyone should pick up first.
		deferred: 4
	};
	const sortCards = <T extends { priority: string }>(cards: T[]) =>
		[...cards].sort((a, b) => (priorityRank[a.priority] ?? 2) - (priorityRank[b.priority] ?? 2));

	const fmtDate = (value: Date | string | null) => formatDateShort(value, '');

	const hasFilters = $derived(
		Boolean(
			data.filters.search ||
			data.filters.statusId ||
			data.filters.pillarId ||
			data.filters.needId ||
			data.filters.mine ||
			data.filters.untriaged
		)
	);

	const tableColumns = [
		indexColumn,
		{
			id: 'reference',
			header: 'Reference',
			cell: ({ row }: any) => row.original.reference
		},
		{
			id: 'name',
			header: 'Name',
			cell: ({ row }: any) =>
				renderComponent(ApplicationNameCell, {
					name: row.original.name,
					isRead: row.original.isRead
				})
		},
		{
			id: 'pillarName',
			header: 'Programme',
			cell: ({ row }: any) => row.original.pillarName ?? '—'
		},
		{
			id: 'status',
			header: 'Status',
			cell: ({ row }: any) =>
				renderComponent(StatusBadge, {
					label: row.original.statusLabel,
					color: row.original.statusColor
				})
		},
		{
			id: 'reviewerName',
			header: 'Reviewer',
			cell: ({ row }: any) => row.original.reviewerName ?? 'Unassigned'
		},
		{
			id: 'createdAt',
			header: 'Received',
			cell: ({ row }: any) => fmtDate(row.original.createdAt)
		},
		{
			id: 'actions',
			header: '',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(OpenLinkCell, { href: `/dashboard/applications/${row.original.id}` })
		}
	];
</script>

<svelte:head><title>Applications · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="font-heading text-2xl font-bold">Applications</h1>
			<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
				Every request for assistance, across the programmes you have access to.
			</p>
		</div>

		<div class="flex items-center gap-1 rounded-lg border p-1">
			<Button
				variant={view === 'board' ? 'default' : 'ghost'}
				size="sm"
				onclick={() => (view = 'board')}
			>
				<Columns3 class="size-4" /> Board
			</Button>
			<Button
				variant={view === 'table' ? 'default' : 'ghost'}
				size="sm"
				onclick={() => (view = 'table')}
			>
				<Table2 class="size-4" /> List
			</Button>
		</div>
	</div>

	<FilterBar bind:search placeholder="Reference, name, phone or email…" {hasFilters}>
		{#snippet children({ applyFilter })}
			{#each data.pillarOptions as pillar (pillar.id)}
				<Button
					variant={data.filters.pillarId === String(pillar.id) ? 'default' : 'outline'}
					size="sm"
					onclick={() =>
						applyFilter(
							'pillar',
							data.filters.pillarId === String(pillar.id) ? null : String(pillar.id)
						)}
				>
					{pillar.name}
				</Button>
			{/each}

			<Button
				variant={data.filters.mine ? 'default' : 'outline'}
				size="sm"
				onclick={() => applyFilter('mine', data.filters.mine ? null : '1')}
			>
				Assigned to me
			</Button>

			<!-- Applications from someone who did not know which programme they
			     needed. Somebody has to pick one up and route it. -->
			<Button
				variant={data.filters.untriaged ? 'default' : 'outline'}
				size="sm"
				onclick={() => applyFilter('untriaged', data.filters.untriaged ? null : '1')}
			>
				<Inbox class="size-4" /> No programme yet ({untriagedCount})
			</Button>

			<!-- The question the needs catalogue exists to answer. -->
			<div class="w-52">
				<SelectComp
					name="need"
					items={needItems}
					value={data.filters.needId ?? ''}
					onValueChange={(value: string) => applyFilter('need', value || null)}
				/>
			</div>
		{/snippet}
	</FilterBar>

	{#if view === 'board'}
		<!-- The board is read-and-navigate, not drag-and-drop: a status change
		     runs through the server-side transition function (which writes a case
		     note and an audit row), and a drag that silently skipped that would
		     leave a case file with gaps in its history. -->
		<ScrollArea orientation="horizontal" class="w-full pb-4">
			<div class="flex min-w-max gap-3">
				{#each boardColumns as column (column.id)}
					<div class="flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-muted/40 p-3">
						<div class="flex items-center justify-between gap-2">
							<StatusBadge label={column.label} color={column.color} />
							<span class="text-xs font-medium text-muted-foreground">{column.cards.length}</span>
						</div>

						<div class="flex flex-col gap-2">
							{#each sortCards(column.cards) as card (card.id)}
								<a
									href={`/dashboard/applications/${card.id}`}
									class={cn(
										'flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-sm transition-shadow hover:shadow-md',
										!card.isRead && 'border-primary/40'
									)}
								>
									<div class="flex items-center justify-between gap-2">
										<span class="font-mono text-[10px] text-muted-foreground">{card.reference}</span
										>
										{#if card.priority === 'urgent' || card.priority === 'high'}
											<Badge variant="destructive" class="h-4 px-1.5 text-[10px] capitalize">
												{card.priority}
											</Badge>
										{:else if card.priority === 'deferred'}
											<Badge variant="outline" class="h-4 px-1.5 text-[10px]">Deferred</Badge>
										{/if}
									</div>
									<span class="font-medium">{card.name || 'Anonymous'}</span>
									<div
										class="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"
									>
										{#if card.pillarName}<span>{card.pillarName}</span>{/if}
										<span>·</span>
										<span>{fmtDate(card.createdAt)}</span>
										{#if card.reviewerName}
											<span>·</span><span>{card.reviewerName}</span>
										{/if}
									</div>
								</a>
							{:else}
								<p class="py-6 text-center text-xs text-muted-foreground">Nothing here</p>
							{/each}
						</div>
					</div>
				{/each}

				{#if unassigned.length}
					<div class="flex w-72 shrink-0 flex-col gap-2 rounded-xl bg-muted/40 p-3">
						<div class="flex items-center justify-between gap-2">
							<StatusBadge label="No status" color="slate" />
							<span class="text-xs font-medium text-muted-foreground">{unassigned.length}</span>
						</div>
						{#each unassigned as card (card.id)}
							<a
								href={`/dashboard/applications/${card.id}`}
								class="flex flex-col gap-1 rounded-lg border bg-card p-3 text-sm hover:shadow-md"
							>
								<span class="font-mono text-[10px] text-muted-foreground">{card.reference}</span>
								<span class="font-medium">{card.name || 'Anonymous'}</span>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</ScrollArea>
	{:else}
		{#key data.rows}
			<DataTable columns={tableColumns} data={data.rows} search={false} fileName="Applications" />
		{/key}
	{/if}
</div>
