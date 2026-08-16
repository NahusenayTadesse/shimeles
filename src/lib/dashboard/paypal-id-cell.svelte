<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { paypalTarget } from '$lib/donations';

	/**
	 * Shows the identifier that will actually be posted to PayPal, read out of
	 * the stored link. It exists so a staff member can confirm at a glance that
	 * the right campaign is wired up — and so a link that parses to nothing is
	 * visible in the list rather than only discovered by a donor.
	 */
	let { url, isPaypal }: { url: string; isPaypal: boolean } = $props();

	const target = $derived(isPaypal ? paypalTarget(url) : null);
</script>

{#if !isPaypal}
	<span class="text-xs text-muted-foreground">—</span>
{:else if target}
	<span class="font-mono text-xs">{target.value}</span>
{:else}
	<Badge variant="destructive" class="text-[10px]">No id in link</Badge>
{/if}
