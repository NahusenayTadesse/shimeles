<script lang="ts">
	import { ShieldAlert, ShieldCheck } from '@lucide/svelte';

	let { complete }: { complete: boolean } = $props();
</script>

{#if complete}
	<span class="inline-flex items-center gap-1.5 text-success">
		<ShieldCheck class="size-4" /> Complete
	</span>
{:else}
	<span class="inline-flex items-center gap-1.5 text-warning">
		<ShieldAlert class="size-4" /> Incomplete
	</span>
{/if}
