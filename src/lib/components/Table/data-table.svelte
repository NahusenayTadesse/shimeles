<script lang="ts" generics="TData, TValue">
	import {
		type ColumnDef,
		getCoreRowModel,
		getPaginationRowModel,
		getSortedRowModel,
		type RowSelectionState,
		getFilteredRowModel,
		type PaginationState,
		type SortingState,
		type ColumnFiltersState,
		type VisibilityState,
		type GlobalFilterColumn
	} from '@tanstack/table-core';
	import TableExport from './table-export.svelte';

	import { Input } from '$lib/components/ui/input/index.js';

	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';

	let {
		data,
		columns,
		search = true,
		class: className = '',
		fileName = 'File',
		selected = $bindable(),
		serverSide = false,
		total
	}: DataTableProps<TData, TValue> = $props();
	// let filterSchema = $derived(
	//   discoverFilterSchema(data).filter(meta => !filterBlacklist.includes(meta.key))
	// );  import { Input } from "$lib/components/ui/input/index.js";

	import { createSvelteTable, FlexRender } from '$lib/components/ui/data-table/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ChevronDownIcon, Filter, Frown, ListOrdered, X } from '@lucide/svelte';
	import * as Resizable from '$lib/components/ui/resizable/index.js';
	import ResizableHandle from '../ui/resizable/resizable-handle.svelte';
	import { isMobile } from '$lib/global.svelte';

	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: data.length || 10 });
	let columnFilters = $state<ColumnFiltersState>([]);

	type DataTableProps<TData, TValue> = {
		columns: ColumnDef<TData, TValue>[];
		data: TData[];
		search?: boolean;
		class?: string;
		fileName?: string;
		selected?: TData[];
		/**
		 * The rows are one page of a server-filtered query, not the whole table.
		 * Turns off the in-browser paging controls and the row-count breakpoints,
		 * which would otherwise describe the page rather than the result set —
		 * the page supplies its own pagination and passes `total`.
		 */
		serverSide?: boolean;
		/** Result count to show. Defaults to the rows actually held. */
		total?: number;
	};

	let sorting = $state<SortingState>([]);
	let globalFilter = $state<GlobalFilterColumn>();

	let columnVisibility = $state<VisibilityState>({});
	let rowSelection = $state<RowSelectionState>({});

	/**
	 * Matches a scalar cell against the list of ticked values.
	 *
	 * TanStack's built-in `arrIncludesSome` is the other way round — it expects
	 * the *cell* to hold the array — and the default `includesString` would
	 * stringify the whole selection and substring-match it, so ticking "Draft"
	 * and "Live" would match neither.
	 */
	const facetFilter = (row: any, columnId: string, filterValue: unknown) => {
		if (!Array.isArray(filterValue) || filterValue.length === 0) return true;
		return filterValue.includes(String(row.getValue(columnId)));
	};

	const table = createSvelteTable({
		get data() {
			return data;
		},
		columns,
		defaultColumn: { filterFn: facetFilter },
		state: {
			get pagination() {
				return pagination;
			},
			get sorting() {
				return sorting;
			},
			get columnFilters() {
				return columnFilters;
			},
			get columnVisibility() {
				return columnVisibility;
			},

			get globalFilter() {
				return globalFilter;
			},
			get rowSelection() {
				return rowSelection;
			}
		},
		onPaginationChange: (updater) => {
			if (typeof updater === 'function') {
				pagination = updater(pagination);
			} else {
				pagination = updater;
			}
		},
		onSortingChange: (updater) => {
			if (typeof updater === 'function') {
				sorting = updater(sorting);
			} else {
				sorting = updater;
			}
		},
		onColumnFiltersChange: (updater) => {
			if (typeof updater === 'function') {
				columnFilters = updater(columnFilters);
			} else {
				columnFilters = updater;
			}
		},
		onColumnVisibilityChange: (updater) => {
			if (typeof updater === 'function') {
				columnVisibility = updater(columnVisibility);
			} else {
				columnVisibility = updater;
			}
		},
		onRowSelectionChange: (updater) => {
			if (typeof updater === 'function') {
				rowSelection = updater(rowSelection);
			} else {
				rowSelection = updater;
			}
		},

		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel()
	});

	const uniqueTableId = `table-${Math.random().toString(36).substring(2, 15)}`;

	/**
	 * Per-column filters, as a list of the values actually present.
	 *
	 * `columnFilters` has always been wired into the table below; until now
	 * nothing set it, so the only way to narrow a table was the global search
	 * box. Free-text boxes would have been the easy thing to put here and the
	 * wrong one — the values are already known, so the filter is a list to tick
	 * rather than something to spell correctly.
	 *
	 * Only for client-side tables. When the rows are one page of a server-side
	 * query, the distinct values are the page's, not the table's, and a filter
	 * built from them would quietly claim to be narrowing far more than it is —
	 * those screens filter through `FilterBar` against the whole table instead.
	 *
	 * A column with no accessor — the trailing Edit and Delete cells, the
	 * running index — has nothing to filter on, so TanStack reports
	 * `getCanFilter()` false for it and it never reaches this list.
	 */
	const facets = $derived.by(() => {
		if (serverSide) return [];

		return (
			table
				.getAllColumns()
				.filter((column) => column.getCanFilter() && column.getCanHide())
				.map((column) => {
					const seen: Record<string, true> = {};
					for (const row of data) {
						const raw = (row as Record<string, unknown>)[column.id];
						if (raw === null || raw === undefined || raw === '') continue;
						seen[String(raw)] = true;
					}
					return { column, values: Object.keys(seen).sort((a, b) => a.localeCompare(b)) };
				})
				// One distinct value filters nothing, and a column where every row
				// differs (a title, a slug) would be a list as long as the table.
				.filter((facet) => facet.values.length > 1 && facet.values.length <= 30)
		);
	});

	const activeFilterCount = $derived(columnFilters.length);

	/** Column ids are camelCase keys; the dropdown wants them readable. */
	const columnLabel = (id: string) =>
		id.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

	const resultCount = $derived(total ?? table.getFilteredRowModel().rows.length);

	/**
	 * In server mode the rows handed in are already one page, so the client
	 * page size has to follow them.
	 *
	 * `pageSize` is otherwise read once from the initial `data.length`, which is
	 * fine for a table that gets its rows in one go — the content screens remount
	 * this component on every change with `{#key rows}`. It is not fine when the
	 * same instance is handed a different page: land on a filtered result of
	 * three rows, clear the filter, and a stale page size of three would show
	 * three of the twenty-five that came back.
	 */
	$effect(() => {
		if (!serverSide) return;
		const size = data.length || 10;
		if (pagination.pageSize !== size) pagination = { pageIndex: 0, pageSize: size };
	});

	function getTableBreakpoints<T>(data: T[]): number[] {
		const totalItems = data.length;
		const step = 10;
		const breakpoints: number[] = [];

		for (let i = step; i < totalItems; i += step) {
			breakpoints.push(i);
		}

		if (totalItems > 0) {
			breakpoints.push(totalItems);
		}

		return breakpoints;
	}
	if (selected) {
		$effect(() => {
			const selectedRows = table.getSelectedRowModel().rows;

			// Extract the original data from those rows
			selected = selectedRows.map((row) => row.original);
		});
	}
</script>

<!-- min-h-0 is required for flex-child overflow -->
<!-- <div class="flex-1 text-sm text-muted-foreground">
	{table.getFilteredSelectedRowModel().rows.length} of{''}
	{table.getFilteredRowModel().rows.length} row(s) selected.

	{#each table.getFilteredRowModel().rows as selected}
		{selected?.id}
	{/each}
</div> -->
<Resizable.PaneGroup
	direction="horizontal"
	class="mt-4 flex w-full min-w-full gap-0 rounded-lg lg:w-fit lg:min-w-2xl {className}"
>
	<Resizable.Pane
		defaultSize={isMobile()
			? 100
			: table.getAllColumns().filter((col) => col.getIsVisible()).length * 20}
		class="bg-background"
	>
		<ScrollArea orientation="vertical" class="w-full rounded-lg p-2">
			<div class="flex min-w-full flex-col gap-2 rounded-md border-0 px-1">
				<ScrollArea
					orientation="horizontal"
					class="flex w-full flex-row rounded-md border whitespace-nowrap"
				>
					<div
						class="flex w-full space-x-4 p-4
						"
					>
						{#if search}
							<Input
								type="search"
								placeholder="Search Table..."
								class="w-64 lg:w-full"
								bind:value={globalFilter}
								oninput={() => table.setGlobalFilter(globalFilter)}
							/>
						{/if}
						{#if facets.length}
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											variant={activeFilterCount ? 'default' : 'outline'}
											class="ml-auto shrink-0"
										>
											<Filter class="size-4" />
											Filter
											{#if activeFilterCount}
												<span
													class="ml-1 rounded-full bg-background/25 px-1.5 text-xs tabular-nums"
												>
													{activeFilterCount}
												</span>
											{/if}
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end" class="max-h-96 w-56 overflow-y-auto">
									{#each facets as facet (facet.column.id)}
										{@const selected = (facet.column.getFilterValue() as string[]) ?? []}
										<DropdownMenu.Label class="text-xs text-muted-foreground">
											{columnLabel(facet.column.id)}
										</DropdownMenu.Label>
										{#each facet.values as value (value)}
											<DropdownMenu.CheckboxItem
												closeOnSelect={false}
												checked={selected.includes(value)}
												onCheckedChange={(checked) => {
													const next = checked
														? [...selected, value]
														: selected.filter((v) => v !== value);
													// An empty array would match nothing; "no selection"
													// has to clear the filter rather than become one.
													facet.column.setFilterValue(next.length ? next : undefined);
												}}
											>
												{value}
											</DropdownMenu.CheckboxItem>
										{/each}
										<DropdownMenu.Separator />
									{/each}

									{#if activeFilterCount}
										<DropdownMenu.Item closeOnSelect={false} onclick={() => (columnFilters = [])}>
											<X class="size-4" /> Clear filters
										</DropdownMenu.Item>
									{/if}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						{/if}

						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="outline" class="ml-auto"
										>Columns <ChevronDownIcon class="size-5" />
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end">
								{#each table.getAllColumns().filter((col) => col.getCanHide()) as column (column)}
									<DropdownMenu.CheckboxItem
										class="capitalize"
										bind:checked={() => column.getIsVisible(), (v) => column.toggleVisibility(!!v)}
									>
										{column.id.replace(/([a-z])([A-Z])/g, '$1 $2')}
									</DropdownMenu.CheckboxItem>
								{/each}
							</DropdownMenu.Content>
						</DropdownMenu.Root>

						{#if !serverSide}
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button {...props} variant="outline" class="ml-auto"
											>Pages <ChevronDownIcon class="size-5" />
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="center" class="flex w-4! flex-col">
									{#each getTableBreakpoints(data) as column (column)}
										<DropdownMenu.Item
											class="w-4! capitalize"
											onclick={() => {
												table.setPageSize(column);
											}}
										>
											{#snippet child({ props })}
												<Button
													{...props}
													variant={pagination.pageSize === column ? 'default' : 'ghost'}
													size="icon"
													class="max-w-16"
													>{column}
												</Button>
											{/snippet}
										</DropdownMenu.Item>
									{/each}
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						{/if}
						<TableExport {fileName} tableId="#{uniqueTableId}" />
						<Button variant="outline" class="shrink-0">
							<ListOrdered />
							{resultCount} Results
						</Button>
					</div>
				</ScrollArea>

				<div class="rounded-md border">
					<Table.Root id={uniqueTableId} class="relative max-h-96">
						<Table.Header>
							{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
								<Table.Row>
									{#each headerGroup.headers as header, index (header.id)}
										<Table.Head
											colspan={header.colSpan}
											class="{index === 1
												? 'sticky left-0 z-10 bg-background'
												: ''} p-0 px-2 text-start"
										>
											{#if !header.isPlaceholder}
												<FlexRender
													content={header.column.columnDef.header}
													context={header.getContext()}
												/>
											{/if}
										</Table.Head>
									{/each}
								</Table.Row>
							{/each}
						</Table.Header>
						<Table.Body>
							{#each table.getRowModel().rows as row (row.id)}
								<Table.Row data-state={row.getIsSelected() && 'selected'}>
									{#each row.getVisibleCells() as cell, index (cell.id)}
										<Table.Cell
											class="word-break capitalize {index === 1
												? 'sticky left-0 z-10 bg-background'
												: ''}"
										>
											<FlexRender
												content={cell.column.columnDef.cell}
												context={cell.getContext()}
											/>
										</Table.Cell>
									{/each}
								</Table.Row>
							{:else}
								<Table.Row>
									<Table.Cell colspan={columns.length} class="font-2xl text-center">
										<div class="flex flex-row items-center justify-center gap-2">
											<Frown class="animate-bounce" /> Nothing found here.
										</div>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>

					{#if !serverSide && table.getPageCount() > 1}
						<div
							class="absolute -bottom-5 flex w-full items-end justify-end space-x-2 justify-self-center py-4"
						>
							<Button
								variant="outline"
								size="sm"
								onclick={() => table.previousPage()}
								disabled={!table.getCanPreviousPage()}
							>
								Previous
							</Button>
							<Button
								variant="outline"
								size="sm"
								onclick={() => table.nextPage()}
								disabled={!table.getCanNextPage()}
							>
								Next
							</Button>
						</div>
					{/if}
				</div>
			</div>
		</ScrollArea>
	</Resizable.Pane>
	<ResizableHandle withHandle />
	{#if isMobile()}
		<Resizable.Pane defaultSize={0}></Resizable.Pane>
	{:else}
		<Resizable.Pane></Resizable.Pane>
	{/if}
</Resizable.PaneGroup>
