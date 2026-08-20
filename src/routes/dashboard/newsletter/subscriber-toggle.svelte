<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { MailX, RotateCcw } from '@lucide/svelte';

	/**
	 * Unsubscribe / resubscribe, as a cell so the table stays declarative.
	 * The row is never deleted — see the note on the action.
	 */
	let { id, isActive }: { id: number; isActive: boolean } = $props();
</script>

<form method="post" action="?/setSubscribed" use:enhance>
	<input type="hidden" name="id" value={id} />
	<input type="hidden" name="subscribed" value={String(!isActive)} />
	<Button
		type="submit"
		variant="ghost"
		size="sm"
		title={isActive ? 'Unsubscribe them' : 'Put them back on the list'}
	>
		{#if isActive}
			<MailX class="size-4" /> Unsubscribe
		{:else}
			<RotateCcw class="size-4" /> Resubscribe
		{/if}
	</Button>
</form>
