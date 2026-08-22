<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { History } from '@lucide/svelte';
	import { formatRelative } from '$lib/dates';

	/**
	 * The offer to bring back a half-finished form.
	 *
	 * Deliberately an offer. Restoring silently would mean the next person to
	 * open this form on a shared phone sees someone else's answers already in
	 * it — on `/apply` that is household and medical detail. So the person says
	 * whether the draft is theirs, and "Start again" wipes it there and then.
	 */

	let {
		savedAt,
		onrestore,
		ondiscard
	}: { savedAt: number | null; onrestore: () => void; ondiscard: () => void } = $props();
</script>

<div
	class="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4"
	role="status"
>
	<History class="size-5 shrink-0 text-primary" />
	<div class="min-w-48 flex-1">
		<p class="text-sm font-semibold">We saved what you had typed</p>
		<p class="text-sm text-muted-foreground">
			This device has an unfinished form from {formatRelative(savedAt)}. Continue it, or start again
			— starting again deletes it from this device.
		</p>
	</div>
	<div class="flex gap-2">
		<Button type="button" size="sm" onclick={onrestore}>Continue</Button>
		<Button type="button" size="sm" variant="outline" onclick={ondiscard}>Start again</Button>
	</div>
</div>
