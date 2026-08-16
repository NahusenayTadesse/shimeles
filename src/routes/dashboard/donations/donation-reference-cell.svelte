<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

	let {
		reference,
		monthly,
		message
	}: { reference: string; monthly: boolean; message?: string | null } = $props();
</script>

<div>
	<span class="font-mono text-xs font-medium">{reference}</span>
	{#if monthly}
		<Badge variant="secondary" class="ml-2 h-4 px-1.5 text-[10px]">Monthly</Badge>
	{/if}
	{#if message}
		<p class="mt-1 max-w-56 text-xs text-muted-foreground italic">"{message}"</p>
	{/if}
</div>
