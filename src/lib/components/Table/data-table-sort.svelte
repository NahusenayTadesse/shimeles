<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { ArrowDown, ArrowUp, ChevronsUpDown } from '@lucide/svelte';

	/**
	 * A sortable column header for a table the browser holds in full.
	 *
	 * It used to draw one static up-down icon on every sortable column, which
	 * said "this can be sorted" and never "this is the one you sorted, and this
	 * way up". Three clicks in you could not tell what you were looking at.
	 *
	 * Deliberately the same shape as `server-sort.svelte`: the two kinds of
	 * table are an implementation detail nobody using the dashboard should have
	 * to learn, so their headers behave and read identically.
	 */
	let {
		name,
		sorted = false,
		onclick
	}: {
		name: string;
		/** TanStack's `getIsSorted()`: `false`, `'asc'` or `'desc'`. */
		sorted?: false | 'asc' | 'desc';
		onclick?: (event: MouseEvent) => void;
	} = $props();
</script>

<Button
	variant="ghost"
	size="sm"
	{onclick}
	class="-ml-2 h-8 data-[active=true]:font-semibold"
	data-active={sorted !== false}
	title="Sort by {name}"
>
	{name}
	{#if sorted === 'asc'}
		<ArrowUp class="size-3.5" />
	{:else if sorted === 'desc'}
		<ArrowDown class="size-3.5" />
	{:else}
		<ChevronsUpDown class="size-3.5 opacity-50" />
	{/if}
</Button>
