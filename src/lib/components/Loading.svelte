<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	/** Placeholder shown while a table's data resolves. */
	let { name = 'data', rows = 6 }: { name?: string; rows?: number } = $props();
</script>

<div class="flex w-full flex-col gap-3 p-2" aria-busy="true" aria-label="Loading {name}">
	<Skeleton class="h-10 w-full" />
	{#each Array.from({ length: rows }, (_, i) => i) as row (row)}
		<Skeleton class="h-12 w-full" />
	{/each}
</div>
