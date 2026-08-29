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
	import { indexColumn, selectColumn } from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import { Columns3, Inbox, Table2, UserCheck } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { cn } from '$lib/utils';
	import { formatDateShort } from '$lib/dates';

	let { data } = $props();

	/**
	 * Board and table are two views of one dataset. The board groups by
	 * `status_options.stage` — the code-level category — rather than by label, so
	 * renaming a status in the dashboard reorders nothing and breaks nothing.
	 */
	let view = $state<'board' | 'table'>('board');

	/** Rows ticked in the table view, for the bulk assign bar. */
	let selectedRows = $state<{ id: number }[]>([]);
	let bulkReviewer = $state('');
	let assigning = $state(false);
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

	/** Named for the chips above the table, so the board says why it is short. */
	const activeFilters = $derived(
		[
			data.filters.search && { key: 'q', label: `Matching "${data.filters.search}"` },
			data.filters.statusId && {
				key: 'status',
				label:
					data.statuses.find((status) => String(status.id) === data.filters.statusId)?.label ??
					'A status'
			},
			data.filters.pillarId && {
				key: 'pillar',
				label:
					data.pillarOptions.find((pillar) => String(pillar.id) === data.filters.pillarId)?.name ??
					'A programme'
			},
			data.filters.needId && {
				key: 'need',
				label:
					data.needOptions.find((need) => String(need.id) === data.filters.needId)?.name ??
					'A kind of help'
			},
			data.filters.mine && { key: 'mine', label: 'Assigned to me' },
			data.filters.untriaged && { key: 'untriaged', label: 'No programme yet' }
		].filter(Boolean) as { key: string; label: string }[]
	);

	const tableColumns = $derived([
		// Only the table view offers bulk assignment; the board is one card at a
		// time by design.
		...(data.access?.permissions?.includes('submissions.assign') ? [selectColumn] : []),
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
			cell: ({ row }: any) => row.original.pillarName ?? '-'
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
	]);
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

	<FilterBar bind:search placeholder="Reference, name, phone or email…" active={activeFilters}>
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
			{#if selectedRows.length}
				<!-- After an intake round this is thirty cases and one reviewer;
				     doing it one at a time was thirty page loads. -->
				<form
					method="post"
					action="?/assignSelected"
					class="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3"
					use:enhance={() => {
						assigning = true;
						return async ({ result, update }) => {
							assigning = false;
							if (result.type === 'success') {
								const { assigned = 0, skipped = 0 } = (result.data ?? {}) as Record<string, number>;
								toast.success(
									`Assigned ${assigned} application${assigned === 1 ? '' : 's'}` +
										(skipped
											? `. ${skipped} were outside your programmes and were left alone.`
											: '.')
								);
								selectedRows = [];
								bulkReviewer = '';
							} else if (result.type === 'failure') {
								toast.error(String(result.data?.message ?? 'That did not work.'));
							}
							await update({ reset: false });
						};
					}}
				>
					<UserCheck class="size-4 text-primary" />
					<span class="text-sm font-medium">
						{selectedRows.length} selected
					</span>
					<input type="hidden" name="ids" value={selectedRows.map((row) => row.id).join(',')} />
					<div class="min-w-56">
						<SelectComp
							name="reviewerId"
							bind:value={bulkReviewer}
							items={[
								{ value: '', name: 'Nobody (clear the reviewer)' },
								...data.reviewers.map((reviewer: { id: string; name: string }) => ({
									value: reviewer.id,
									name: reviewer.name
								}))
							]}
						/>
					</div>
					<Button type="submit" size="sm" disabled={assigning}>
						{assigning ? 'Assigning…' : 'Assign'}
					</Button>
				</form>
			{/if}

			<DataTable
				columns={tableColumns}
				data={data.rows}
				search={false}
				fileName="Applications"
				caseScoped
				bind:selected={selectedRows}
				emptyMessage="Applications arrive from the public /apply form. Nothing has come in that matches this view."
			/>
		{/key}
	{/if}
</div>
