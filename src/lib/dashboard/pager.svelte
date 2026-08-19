<script lang="ts">
	import { page as currentPage } from '$app/state';
	import { applyFilter } from '$lib/dashboard/apply-filter';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { selectItem } from '$lib/global.svelte';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';

	/**
	 * Page controls for a server-paginated list. Writes `page` and `perPage`
	 * into the URL; the route's `load` clamps both, so neither is trusted here.
	 */
	let {
		page,
		pageCount,
		perPage,
		total
	}: {
		page: number;
		pageCount: number;
		perPage: number;
		total: number;
	} = $props();

	// Changing the page size renumbers the pages, so `perPage` drops `page`;
	// moving between pages is the one filter change that must not.
	const set = (key: string, value: string) =>
		applyFilter(currentPage.url, key, value, { resetsPage: key === 'perPage' });

	const first = $derived(total === 0 ? 0 : (page - 1) * perPage + 1);
	const last = $derived(Math.min(page * perPage, total));
</script>

<div class="flex flex-wrap items-center justify-between gap-3 px-1 py-2">
	<p class="text-sm text-muted-foreground">
		{#if total === 0}
			No matching rows
		{:else}
			Showing <span class="font-medium text-foreground">{first}–{last}</span> of
			<span class="font-medium text-foreground">{total}</span>
		{/if}
	</p>

	<div class="flex items-center gap-2">
		<Select.Root
			type="single"
			value={String(perPage)}
			onValueChange={(v) => v && set('perPage', v)}
		>
			<Select.Trigger class="h-8 w-28 text-sm">{perPage} per page</Select.Trigger>
			<Select.Content>
				{#each [25, 50, 100, 200] as size (size)}
					<Select.Item value={String(size)} class={selectItem}>{size} per page</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		<Button
			variant="outline"
			size="sm"
			disabled={page <= 1}
			onclick={() => set('page', String(page - 1))}
		>
			<ChevronLeft class="size-4" /> Previous
		</Button>
		<span class="text-sm text-muted-foreground tabular-nums">Page {page} of {pageCount}</span>
		<Button
			variant="outline"
			size="sm"
			disabled={page >= pageCount}
			onclick={() => set('page', String(page + 1))}
		>
			Next <ChevronRight class="size-4" />
		</Button>
	</div>
</div>
