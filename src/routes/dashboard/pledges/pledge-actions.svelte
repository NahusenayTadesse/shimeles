<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { BellRing, Pause, Play, X } from '@lucide/svelte';

	let { id, status }: { id: number; status: string } = $props();
</script>

<div class="flex items-center justify-end gap-1">
	{#if status === 'active'}
		<form method="post" action="?/sendReminder" use:enhance>
			<input type="hidden" name="id" value={id} />
			<Button type="submit" size="sm" variant="outline">
				<BellRing class="size-4" /> Remind
			</Button>
		</form>
		<form method="post" action="?/setStatus" use:enhance>
			<input type="hidden" name="id" value={id} />
			<input type="hidden" name="status" value="paused" />
			<Button type="submit" size="icon" variant="ghost" title="Pause">
				<Pause class="size-4" />
			</Button>
		</form>
	{:else if status === 'paused'}
		<form method="post" action="?/setStatus" use:enhance>
			<input type="hidden" name="id" value={id} />
			<input type="hidden" name="status" value="active" />
			<Button type="submit" size="sm" variant="outline">
				<Play class="size-4" /> Resume
			</Button>
		</form>
	{/if}

	{#if status !== 'cancelled'}
		<form method="post" action="?/setStatus" use:enhance>
			<input type="hidden" name="id" value={id} />
			<input type="hidden" name="status" value="cancelled" />
			<Button type="submit" size="icon" variant="ghost" title="Cancel">
				<X class="size-4" />
			</Button>
		</form>
	{/if}
</div>
