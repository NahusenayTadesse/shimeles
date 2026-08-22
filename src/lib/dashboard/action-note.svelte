<script lang="ts">
	import { CircleCheck } from '@lucide/svelte';
	import { formatDateTime } from '$lib/dates';

	/**
	 * A confirmation that stays put.
	 *
	 * Several outcomes were reported by toast alone — a status change, a
	 * reconciliation, an intake — and a toast fades whether or not anyone was
	 * looking at it. On a screen where the change is the whole point of the
	 * visit, "did that save?" should be answerable by looking at the thing that
	 * changed, not by remembering a notification.
	 *
	 * So this sits next to the control, says what happened and when, and does
	 * not disappear on its own. The toast still fires: it is the thing that
	 * catches your eye, and this is the thing that is still there afterwards.
	 */

	let { message = '', at = null }: { message?: string; at?: number | null } = $props();
</script>

{#if message}
	<p
		class="flex flex-wrap items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm"
		role="status"
	>
		<CircleCheck class="size-4 shrink-0 text-success" />
		<span>{message}</span>
		{#if at}
			<span class="text-xs text-muted-foreground">{formatDateTime(at)}</span>
		{/if}
	</p>
{/if}
