<script lang="ts">
	import { page as currentPage } from '$app/state';
	import { applyFilters } from '$lib/dashboard/apply-filter';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ArrowDown, ArrowUp, ChevronsUpDown } from '@lucide/svelte';

	/**
	 * A sortable column header for a server-paginated table.
	 *
	 * The counterpart to `data-table-sort.svelte`, which sorts the rows the
	 * browser is holding. That is the wrong answer once the browser is only
	 * holding one page: sorting twenty-five of four hundred rows puts the wrong
	 * twenty-five at the top. This writes the sort into the URL instead and lets
	 * the query run again.
	 */
	let {
		name,
		field,
		sort
	}: {
		name: string;
		/** Must be a key in the route's `QueryMap`, or the server ignores it. */
		field: string;
		sort: { field: string | null; direction: 'asc' | 'desc' };
	} = $props();

	const active = $derived(sort.field === field);

	function toggle() {
		applyFilters(currentPage.url, {
			sort: field,
			// First click on a new column sorts descending — for dates and counts,
			// which is most of what gets sorted here, the interesting end is the top.
			dir: active && sort.direction === 'desc' ? 'asc' : 'desc'
		});
	}
</script>

<Button
	variant="ghost"
	size="sm"
	onclick={toggle}
	class="-ml-3 h-8 data-[active=true]:font-semibold"
	data-active={active}
>
	{name}
	{#if !active}
		<ChevronsUpDown class="size-3.5 opacity-50" />
	{:else if sort.direction === 'asc'}
		<ArrowUp class="size-3.5" />
	{:else}
		<ArrowDown class="size-3.5" />
	{/if}
</Button>
