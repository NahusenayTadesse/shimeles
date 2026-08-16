<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

	let { name, banned }: { name: string; banned: boolean } = $props();
</script>

<span class="font-medium">{name}</span>
{#if banned}
	<Badge variant="destructive" class="ml-2">Suspended</Badge>
{/if}
