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
		type ColumnSizingState,
		type GlobalFilterColumn
	} from '@tanstack/table-core';
	import TableExport from './table-export.svelte';
	import FacetFilter from './facet-filter.svelte';
	import { selectColumn } from '$lib/dashboard/columns';

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
		total,
		emptyTitle = '',
		emptyMessage = '',
		emptyAction,
		caseScoped = false,
		selectable = false,
		bulkActions
	}: DataTableProps<TData, TValue> = $props();
	import { createSvelteTable, FlexRender } from '$lib/components/ui/data-table/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ChevronDownIcon, Inbox, ListOrdered, Lock, SearchX, X } from '@lucide/svelte';
	import { phone } from '$lib/global.svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { Snippet } from 'svelte';

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
		/** Heading for the empty state. Defaults to "No <fileName> yet". */
		emptyTitle?: string;
		/** Sentence under that heading. */
		emptyMessage?: string;
		/** A button for the empty state — usually the screen's own "Add" control. */
		emptyAction?: Snippet;
		/**
		 * This table shows case data, so an empty result may mean the user has
		 * not been assigned to a programme rather than that there is nothing to
		 * see. Set on the screens `pillarScope` applies to.
		 */
		caseScoped?: boolean;
		/**
		 * Prepends the tick-box column and shows the bulk bar.
		 *
		 * Opt-in per screen rather than always on: a column of checkboxes that
		 * nothing can act on is a control that does nothing, and every table in
		 * the dashboard would have grown one.
		 */
		selectable?: boolean;
		/**
		 * What can be done to a selection, rendered in a bar above the table
		 * while anything is ticked. Receives the selected rows and a `clear`
		 * callback, so an action can empty the selection once it has run.
		 */
		bulkActions?: Snippet<[{ rows: TData[]; clear: () => void }]>;
	};

	let sorting = $state<SortingState>([]);
	let globalFilter = $state<GlobalFilterColumn>();

	let columnVisibility = $state<VisibilityState>({});
	let rowSelection = $state<RowSelectionState>({});

	/* ==========================================================================
	   The empty state

	   Every table used to render the same bouncing frown and "Nothing found
	   here." for three quite different situations: a table with nothing in it,
	   a filter that matched nothing, and a pillar-scoped user who has not been
	   assigned to a programme and will see this on every case screen until an
	   administrator fixes it. The third is the worst — a new caseworker's first
	   impression of the system is an empty board that does not say why.

	   Filters are read off the URL rather than passed in: every server-filtered
	   screen puts them there (see `filter-bar.svelte`), so this needs no
	   plumbing at each of the ten call sites.
	   ========================================================================== */

	const urlFilters = $derived(
		[...page.url.searchParams.entries()].filter(([key, value]) => key !== 'page' && value !== '')
	);

	const filtered = $derived(
		urlFilters.length > 0 || Boolean(globalFilter) || columnFilters.length > 0
	);

	/** "Applications" → "applications", for a sentence. */
	const subject = $derived(fileName === 'File' ? 'records' : fileName.toLowerCase());

	/**
	 * `null` means "all pillars" (a super admin); an empty array means the user
	 * has been given no programme at all, which on a case screen is the whole
	 * explanation for an empty board.
	 */
	const noPillarAccess = $derived(
		caseScoped &&
			Array.isArray(page.data?.access?.pillarIds) &&
			page.data.access.pillarIds.length === 0
	);

	const emptyHeading = $derived(
		noPillarAccess
			? 'You have not been assigned to a programme yet'
			: filtered
				? 'No results for these filters'
				: emptyTitle || `No ${subject} yet`
	);

	const emptyBody = $derived(
		noPillarAccess
			? 'Case screens only show the programmes your account covers. An administrator can assign you one under System → Users & roles.'
			: filtered
				? 'Nothing here matches what you are filtering by. Clearing the filters brings the whole list back.'
				: emptyMessage
	);

	function clearFilters() {
		globalFilter = undefined;
		table.setGlobalFilter(undefined);
		columnFilters = [];
		if (urlFilters.length) goto(page.url.pathname);
	}

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

	/**
	 * The tick-box column is added here rather than by each screen, so
	 * `selectable` is the whole of what a page has to say. It goes first,
	 * before the running index.
	 */
	const allColumns = $derived(
		selectable ? [selectColumn as ColumnDef<TData, TValue>, ...columns] : columns
	);

	const table = createSvelteTable({
		get data() {
			return data;
		},
		get columns() {
			return allColumns;
		},
		defaultColumn: { filterFn: facetFilter, minSize: 64 },
		enableColumnResizing: true,
		columnResizeMode: 'onChange',
		onColumnSizingChange: (updater) => {
			columnSizing = typeof updater === 'function' ? updater(columnSizing) : updater;
		},
		state: {
			get columnSizing() {
				return columnSizing;
			},
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
	/** What a cell shows, when what it shows is text rather than a component. */
	function displayValue(row: any, column: any): string | null {
		const render = column.columnDef?.cell;
		if (typeof render !== 'function') return null;
		try {
			const cell = row.getAllCells().find((entry: any) => entry.column.id === column.id);
			if (!cell) return null;
			const out = render(cell.getContext());
			return typeof out === 'string' || typeof out === 'number' ? String(out) : null;
		} catch {
			// A cell renderer that needs more than a context is not a label source.
			return null;
		}
	}

	const facets = $derived.by(() => {
		if (serverSide) return [];

		return table
			.getAllColumns()
			.filter((column) => column.getCanFilter() && column.getCanHide())
			.map((column) => {
				/*
				 * Two values per entry, and the difference matters.
				 *
				 * `value` is what the column stores and what the filter compares
				 * against. `label` is what the column *shows* — a group column
				 * holds `categoryId: 3` and renders "Care and companionship", and
				 * a filter offering "1, 2, 3" is a filter nobody can use. So the
				 * cell renderer is asked what this row looks like, and its answer
				 * is used when it is text. A cell that renders a component answers
				 * with an object, and that column falls back to its stored value
				 * rather than guessing.
				 *
				 * Counted, too. "Health 12" says whether a filter is worth applying
				 * before you apply it rather than after.
				 */
				const counts = new Map<string, number>();
				const labels = new Map<string, string>();

				for (const row of table.getPreFilteredRowModel().rows) {
					const raw = row.getValue(column.id);
					if (raw === null || raw === undefined || raw === '') continue;
					const key = String(raw);
					counts.set(key, (counts.get(key) ?? 0) + 1);
					if (!labels.has(key)) labels.set(key, displayValue(row, column) ?? key);
				}

				return {
					column,
					label: labelFor(column),
					values: [...counts.entries()]
						.map(([value, count]) => ({ value, count, label: labels.get(value) ?? value }))
						.sort((a, b) => a.label.localeCompare(b.label))
				};
			})
			.filter(
				(facet) =>
					// One distinct value filters nothing, and a column where every
					// row differs (a title, a slug) would be a list as long as the
					// table.
					facet.values.length > 1 &&
					facet.values.length <= 30 &&
					// A column of nothing but numbers is a measurement or a running
					// order, not a set of categories — "Order: 5" is a filter nobody
					// wants. Where a number really is a category it has a lookup
					// behind it, and the label resolution above has already turned
					// it into the word the table shows.
					facet.values.some((entry) => !/^-?\d+(\.\d+)?$/.test(entry.label.trim()))
			);
	});

	/**
	 * The narrowings in force, as chips.
	 *
	 * The same row the server-filtered screens grew, for the same reason: the
	 * controls themselves cannot say what is hidden, and a table showing four
	 * of forty rows looks exactly like a table with four rows in it.
	 */
	const activeFacets = $derived(
		facets.flatMap((facet) => {
			const selected = (facet.column.getFilterValue() as string[]) ?? [];
			return selected.map((value) => ({
				column: facet.column,
				value,
				// The chip says what the table says, not what the database stores.
				label: facet.values.find((entry) => entry.value === value)?.label ?? value
			}));
		})
	);

	function dropFacetValue(column: any, value: string) {
		const selected = (column.getFilterValue() as string[]) ?? [];
		const next = selected.filter((entry) => entry !== value);
		column.setFilterValue(next.length ? next : undefined);
	}

	/* ==========================================================================
	   The phone layout

	   Ten columns on a four-inch screen means dragging sideways to reach the
	   Edit button, and reading a row by scrolling back and forth between the
	   header and the value. So on a phone each row becomes a card: the first
	   real column is its heading, the rest are labelled underneath, and the
	   row's controls sit along the bottom where a thumb can reach them.

	   Which cells are which is decided by column id, and anything unrecognised
	   falls through to a labelled line — an unknown column shows up plainly
	   rather than disappearing.
	   ========================================================================== */

	const ACTION_COLUMNS = new Set(['edit', 'delete', 'open', 'view', 'actions', 'remove']);

	/**
	 * What to call a column, wherever its header row is not in front of you —
	 * on a phone card, or on a filter button.
	 *
	 * The column's own declared name first, then the header if it is plain
	 * text, and only then the key it is stored under. Reading the key is the
	 * last resort because it is the one that produces "Category Id" for a
	 * column every user knows as "Group".
	 */
	const labelFor = (column: any) => {
		const definition = column.columnDef;
		if (typeof definition.meta?.label === 'string') return definition.meta.label;
		if (typeof definition.header === 'string') return definition.header;
		return columnLabel(column.id);
	};

	const cardCells = (row: any) => {
		const cells = row.getVisibleCells();
		const select = cells.find((cell: any) => cell.column.id === 'select');
		const index = cells.find((cell: any) => cell.column.id === 'index');
		const actions = cells.filter((cell: any) => ACTION_COLUMNS.has(cell.column.id));
		const rest = cells.filter(
			(cell: any) =>
				cell.column.id !== 'select' &&
				cell.column.id !== 'index' &&
				!ACTION_COLUMNS.has(cell.column.id)
		);
		return { select, index, actions, heading: rest[0], fields: rest.slice(1) };
	};

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

	/* ==========================================================================
	   Widths

	   Two drags, because they answer two different questions. The divider
	   between two column headers widens the one column whose value is cut off
	   — "https://ww…" in a link column is the actual complaint, and making the
	   whole table wider never fixed it. The handle on the outer edge narrows
	   the table itself, which is what someone reading a five-column table on a
	   wide screen wants.

	   Both are remembered per screen and both reset on a double-click. They
	   are a convenience, so every storage call is wrapped: a private window or
	   a browser set to block site data must give you a normal table, not a
	   broken one.
	   ========================================================================== */

	let columnSizing = $state<ColumnSizingState>({});
	/** null means "as wide as the page gives us", which is the default. */
	let tableWidth = $state<number | null>(null);
	let shell = $state<HTMLElement | null>(null);

	const storeKey = $derived(`table-widths:${page.url.pathname}:${fileName}`);

	/** Restores on arrival, and again whenever the screen changes under us. */
	$effect(() => {
		let saved: { columns?: ColumnSizingState; width?: number | null } | null = null;
		try {
			saved = JSON.parse(localStorage.getItem(storeKey) ?? 'null');
		} catch {
			saved = null;
		}
		columnSizing = saved?.columns ?? {};
		tableWidth = saved?.width ?? null;
	});

	function persist() {
		try {
			if (!Object.keys(columnSizing).length && tableWidth === null) {
				localStorage.removeItem(storeKey);
			} else {
				localStorage.setItem(
					storeKey,
					JSON.stringify({ columns: columnSizing, width: tableWidth })
				);
			}
		} catch {
			// Nothing to do about it, and nothing that needs saying.
		}
	}

	/**
	 * Hands over to TanStack, but seeds the column's real rendered width first.
	 * Unsized columns report the library's default of 150 rather than what the
	 * browser actually laid out, so without this the column jumps to 150px the
	 * instant you touch the divider and then follows the mouse from there.
	 */
	function startColumnResize(event: MouseEvent | TouchEvent, header: any) {
		const cell = (event.currentTarget as HTMLElement).closest('th');
		if (cell && columnSizing[header.column.id] === undefined) {
			columnSizing = {
				...columnSizing,
				[header.column.id]: Math.round(cell.getBoundingClientRect().width)
			};
		}
		header.getResizeHandler()(event);
		addEventListener('mouseup', persist, { once: true });
		addEventListener('touchend', persist, { once: true });
	}

	const MIN_COLUMN = 64;

	function resetColumn(id: string) {
		const { [id]: _dropped, ...rest } = columnSizing;
		columnSizing = rest;
		persist();
	}

	/** The divider takes focus, so the arrow keys have to move it. */
	function nudgeColumn(event: KeyboardEvent, header: any) {
		const step = event.shiftKey ? 48 : 12;
		const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!direction) return;
		event.preventDefault();
		const cell = (event.currentTarget as HTMLElement).closest('th');
		const from =
			columnSizing[header.column.id] ?? Math.round(cell?.getBoundingClientRect().width ?? 0);
		columnSizing = {
			...columnSizing,
			[header.column.id]: Math.max(from + direction * step, MIN_COLUMN)
		};
		persist();
	}

	const MIN_TABLE = 320;

	function shellBounds() {
		const width = shell?.getBoundingClientRect().width ?? 0;
		const max = shell?.parentElement?.getBoundingClientRect().width ?? width;
		return { width, max };
	}

	function startShellResize(event: PointerEvent) {
		const handle = event.currentTarget as HTMLElement;
		const { width: startWidth, max } = shellBounds();
		const startX = event.clientX;
		handle.setPointerCapture(event.pointerId);

		const move = (moved: PointerEvent) => {
			tableWidth = Math.round(
				Math.min(Math.max(startWidth + moved.clientX - startX, MIN_TABLE), max)
			);
		};
		const done = () => {
			handle.removeEventListener('pointermove', move);
			handle.releasePointerCapture(event.pointerId);
			persist();
		};

		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', done, { once: true });
		handle.addEventListener('pointercancel', done, { once: true });
	}

	function nudgeShell(event: KeyboardEvent) {
		const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!direction) return;
		event.preventDefault();
		const { width, max } = shellBounds();
		const step = event.shiftKey ? 96 : 24;
		tableWidth = Math.round(Math.min(Math.max(width + direction * step, MIN_TABLE), max));
		persist();
	}

	function resetWidths() {
		tableWidth = null;
		persist();
	}

	/**
	 * The selection, for the bulk bar. Read straight off the table rather than
	 * from `selected`, which is an optional binding a screen may not have passed
	 * — the bar has to work whether or not anybody is listening.
	 */
	const selectedRows = $derived(table.getSelectedRowModel().rows.map((row) => row.original));

	const clearSelection = () => table.resetRowSelection();
</script>

<!-- min-h-0 is required for flex-child overflow -->
{#snippet nothingHere()}
	<div class="mx-auto flex max-w-md flex-col items-center gap-2">
		<div
			class="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
		>
			{#if noPillarAccess}
				<Lock class="size-5" />
			{:else if filtered}
				<SearchX class="size-5" />
			{:else}
				<Inbox class="size-5" />
			{/if}
		</div>
		<p class="text-base font-semibold normal-case">{emptyHeading}</p>
		{#if emptyBody}
			<p class="text-sm font-normal text-muted-foreground normal-case">
				{emptyBody}
			</p>
		{/if}
		{#if filtered && !noPillarAccess}
			<Button variant="outline" size="sm" class="mt-2" onclick={clearFilters}>
				<X class="size-4" /> Clear filters
			</Button>
		{:else if emptyAction}
			<div class="mt-2">{@render emptyAction()}</div>
		{/if}
	</div>
{/snippet}

<!--
	The outer width used to be a pane in a two-pane group whose second pane was
	empty, so the handle dragged the table against nothing and its starting
	width was the visible column count times twenty. It is one element with a
	handle on its edge now, and the width it is dragged to is kept.
-->
<div class="mt-4 w-full {className}">
	<div
		bind:this={shell}
		class="relative rounded-lg bg-background"
		style={tableWidth !== null && !phone.current ? `width:${tableWidth}px` : undefined}
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

						<!--
							Hidden unless there is a choice to make. A table of two rows
							offered a menu holding "2", which is not a page size so much as
							a statement of how many rows there are.
						-->
						{#if !serverSide && getTableBreakpoints(data).length > 1}
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<!--
											It sets how many rows a page holds, so it says so. Labelled
											"Pages", it read as the pager it sits next to, and the number
											it is showing is the useful half of the answer anyway.
										-->
										<Button {...props} variant="outline" class="ml-auto">
											{pagination.pageSize} per page <ChevronDownIcon class="size-5" />
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

				{#if facets.length}
					<!--
						The filters live on the surface, not behind one button. What a
						table can be narrowed by is part of what the table is, and
						hiding it meant nobody found it — the row says "Group",
						"Licence", "Status" before anything is clicked.
					-->
					<div class="flex flex-wrap items-center gap-1.5">
						<span class="text-xs tracking-wide text-muted-foreground uppercase">Filter by</span>
						{#each facets as facet (facet.column.id)}
							<FacetFilter
								label={facet.label}
								values={facet.values}
								selected={(facet.column.getFilterValue() as string[]) ?? []}
								onchange={(next) => facet.column.setFilterValue(next.length ? next : undefined)}
							/>
						{/each}
					</div>
				{/if}

				{#if activeFacets.length}
					<!--
						The same chips the server-filtered screens carry. A table showing
						four of forty rows looks exactly like a table with four rows in
						it, and the dropdowns above cannot say which of them is why.
					-->
					<div class="flex flex-wrap items-center gap-1.5">
						<span class="text-xs text-muted-foreground">Showing only:</span>
						{#each activeFacets as chip (chip.column.id + chip.value)}
							<button
								type="button"
								title="Remove this filter"
								onclick={() => dropFacetValue(chip.column, chip.value)}
								class="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-0.5 pr-1.5 pl-2.5 text-xs font-medium text-foreground capitalize transition-colors hover:border-primary hover:bg-primary/20"
							>
								{chip.label}
								<X class="size-3 opacity-70" />
							</button>
						{/each}
						<Button
							variant="ghost"
							size="sm"
							class="h-6 px-2 text-xs"
							onclick={() => (columnFilters = [])}
						>
							Clear all
						</Button>
					</div>
				{/if}

				{#if selectable && bulkActions && selectedRows.length}
					<div
						class="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2"
					>
						<span class="px-2 text-sm font-medium">
							{selectedRows.length} selected
						</span>
						{@render bulkActions({ rows: selectedRows, clear: clearSelection })}
						<Button variant="ghost" size="sm" class="ml-auto" onclick={clearSelection}>
							<X class="size-4" /> Clear
						</Button>
					</div>
				{/if}

				{#if phone.current}
					<div class="flex flex-col gap-2">
						{#each table.getRowModel().rows as row (row.id)}
							{@const parts = cardCells(row)}
							<div
								class="rounded-lg border bg-card p-3 data-[state=selected]:border-primary data-[state=selected]:bg-primary/5"
								data-state={row.getIsSelected() && 'selected'}
							>
								<div class="flex items-start gap-2">
									{#if parts.select}
										<FlexRender
											content={parts.select.column.columnDef.cell}
											context={parts.select.getContext()}
										/>
									{/if}
									{#if parts.index}
										<span class="text-xs text-muted-foreground">
											<FlexRender
												content={parts.index.column.columnDef.cell}
												context={parts.index.getContext()}
											/>
										</span>
									{/if}
									{#if parts.heading}
										<div class="min-w-0 flex-1 font-medium">
											<FlexRender
												content={parts.heading.column.columnDef.cell}
												context={parts.heading.getContext()}
											/>
										</div>
									{/if}
								</div>

								{#if parts.fields.length}
									<dl class="mt-2 flex flex-col gap-1 border-t pt-2">
										{#each parts.fields as cell (cell.id)}
											<div class="flex items-baseline justify-between gap-3">
												<dt
													class="shrink-0 text-[10px] tracking-wider text-muted-foreground uppercase"
												>
													{labelFor(cell.column)}
												</dt>
												<dd class="min-w-0 text-right text-sm">
													<FlexRender
														content={cell.column.columnDef.cell}
														context={cell.getContext()}
													/>
												</dd>
											</div>
										{/each}
									</dl>
								{/if}

								{#if parts.actions.length}
									<div class="mt-2 flex flex-wrap items-center justify-end gap-2 border-t pt-2">
										{#each parts.actions as cell (cell.id)}
											<FlexRender
												content={cell.column.columnDef.cell}
												context={cell.getContext()}
											/>
										{/each}
									</div>
								{/if}
							</div>
						{:else}
							<div class="rounded-lg border py-12 text-center">
								{@render nothingHere()}
							</div>
						{/each}
					</div>
				{:else}
					<div class="rounded-md border">
						<Table.Root id={uniqueTableId} class="group/table relative max-h-96">
							<Table.Header>
								{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
									<Table.Row>
										{#each headerGroup.headers as header, index (header.id)}
											<Table.Head
												colspan={header.colSpan}
												style={columnSizing[header.column.id]
													? `width:${columnSizing[header.column.id]}px`
													: undefined}
												class="relative {index === 1
													? 'sticky left-0 z-10 bg-background'
													: ''} p-0 px-2 text-start"
											>
												{#if !header.isPlaceholder}
													<FlexRender
														content={header.column.columnDef.header}
														context={header.getContext()}
													/>
												{/if}

												{#if header.column.getCanResize()}
													<!--
													A divider rather than an edge you have to find: it is
													always faintly there, darkens under the cursor, and
													takes focus so the arrow keys can move it too.
												-->
													<button
														type="button"
														aria-label="Resize {columnLabel(header.column.id)} column"
														onmousedown={(event) => startColumnResize(event, header)}
														ontouchstart={(event) => startColumnResize(event, header)}
														ondblclick={() => resetColumn(header.column.id)}
														onkeydown={(event) => nudgeColumn(event, header)}
														class="absolute inset-y-1 -right-px z-20 w-1.5 cursor-col-resize touch-none rounded-full bg-border/60 opacity-0 transition-opacity group-hover/table:opacity-100 hover:bg-primary hover:opacity-100 focus-visible:bg-primary focus-visible:opacity-100 focus-visible:outline-none"
													></button>
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
									<Table.Row class="hover:bg-transparent">
										<Table.Cell colspan={allColumns.length} class="py-12 text-center">
											{@render nothingHere()}
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
				{/if}
			</div>
		</ScrollArea>

		<!--
			Hidden on a phone, where the table already fills the screen and there
			is nothing to give the width back to.
		-->
		{#if !phone.current}
			<button
				type="button"
				aria-label="Resize the table"
				onpointerdown={startShellResize}
				ondblclick={resetWidths}
				onkeydown={nudgeShell}
				title="Drag to resize. Double-click to fit the page."
				class="group/handle absolute inset-y-0 -right-2 flex w-4 cursor-col-resize touch-none items-center justify-center focus-visible:outline-none"
			>
				<span
					class="h-10 w-1 rounded-full bg-border transition-colors group-hover/handle:bg-primary group-focus-visible/handle:bg-primary"
				></span>
			</button>
		{/if}
	</div>
</div>
