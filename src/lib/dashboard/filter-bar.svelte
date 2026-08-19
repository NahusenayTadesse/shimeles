<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { applyFilter as applyToUrl } from '$lib/dashboard/apply-filter';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Search, X } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

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
		resetsPage = false,
		children
	}: {
		search?: string;
		searchKey?: string;
		placeholder?: string;
		hasFilters?: boolean;
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

	{#if hasFilters}
		<Button variant="ghost" size="sm" onclick={clearAll}>
			<X class="size-4" /> Clear
		</Button>
	{/if}
</div>
