<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ShieldOff } from '@lucide/svelte';

	let { userId, banned }: { userId: string; banned: boolean } = $props();
</script>

<form method="post" action="?/setBanned" use:enhance>
	<input type="hidden" name="userId" value={userId} />
	<input type="hidden" name="banned" value={String(!banned)} />
	<Button type="submit" size="sm" variant="ghost" title={banned ? 'Restore' : 'Suspend'}>
		<ShieldOff class="size-4" />
	</Button>
</form>
