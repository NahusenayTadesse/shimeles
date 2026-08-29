<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { applyFilter as applyToUrl, applyFilters } from '$lib/dashboard/apply-filter';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Search, X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	/**
	 * One narrowing currently in force, named the way a person would say it.
	 * `key` is the query parameter it removes — an array where one control owns
	 * several, like a date range.
	 */
	export type ActiveFilter = { key: string | string[]; label: string };

	/**
	 * The URL-driven search-and-filter bar shared by every list page whose
	 * filtering happens server-side (Applications, Volunteers, Donations,
	 * Audit log — anything with too many rows to filter client-side in
	 * `DataTable`). Filters live in the URL, so a filtered list is a
	 * shareable link; this component only ever reads/writes query params.
	 *
	 * The search box and Clear button are the same everywhere, so they live
	 * here. The filter buttons themselves (pillar tabs, status tabs, action
	 * types...) differ per page, so the caller supplies them as children.
	 */
	let {
		search = $bindable(''),
		searchKey = 'q',
		placeholder = 'Search…',
		hasFilters = false,
		active = [],
		resetsPage = false,
		children
	}: {
		search?: string;
		searchKey?: string;
		placeholder?: string;
		hasFilters?: boolean;
		/**
		 * What the list is narrowed by right now, shown as a row of chips.
		 *
		 * Filters live in the URL, which makes a filtered list a link worth
		 * sending — and also means somebody can arrive at one, or come back to a
		 * bookmark, with no idea that four fifths of the records are being
		 * hidden from them. The controls themselves are no help: a status tab
		 * scrolled out of view or a select two rows up does not read as "this is
		 * why the table is nearly empty". The chips say it in one line, and each
		 * one takes its own filter off.
		 */
		active?: ActiveFilter[];
		/** Whether changing a filter should also drop `?page`, for paginated lists. */
		resetsPage?: boolean;
		children?: Snippet<[{ applyFilter: (key: string, value: string | null) => void }]>;
	} = $props();

	/** Filters live in the URL, so a filtered list is a shareable link. */
	const applyFilter = (key: string, value: string | null) =>
		applyToUrl(page.url, key, value, { resetsPage });

	function clearAll() {
		search = '';
		goto(page.url.pathname);
	}

	function remove(filter: ActiveFilter) {
		const keys = Array.isArray(filter.key) ? filter.key : [filter.key];
		// The search box is bound state as well as a query parameter, so clearing
		// its chip has to empty the box too or the word stays sitting there
		// looking like it is still in force.
		if (keys.includes(searchKey)) search = '';
		applyFilters(page.url, Object.fromEntries(keys.map((key) => [key, null])), { resetsPage });
	}

	const showing = $derived(hasFilters || active.length > 0);
</script>

<div class="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
	<div class="relative min-w-56 flex-1">
		<Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
		<Input
			bind:value={search}
			{placeholder}
			class="pl-9"
			onkeydown={(e) => e.key === 'Enter' && applyFilter(searchKey, search)}
		/>
	</div>

	{@render children?.({ applyFilter })}

	{#if showing}
		<Button variant="ghost" size="sm" onclick={clearAll}>
			<X class="size-4" /> Clear
		</Button>
	{/if}

	{#if active.length}
		<div class="flex w-full flex-wrap items-center gap-1.5 border-t pt-2">
			<span class="text-xs text-muted-foreground">Showing only:</span>
			{#each active as filter (String(filter.key) + filter.label)}
				<button
					type="button"
					onclick={() => remove(filter)}
					title="Remove this filter"
					class="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-0.5 pr-1.5 pl-2.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/20"
				>
					{filter.label}
					<X class="size-3 opacity-70" />
				</button>
			{/each}
		</div>
	{/if}
</div>
