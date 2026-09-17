<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { ExternalLink, Paperclip } from '@lucide/svelte';

	/**
	 * The donor's own proof of transfer.
	 *
	 * In Ethiopia a transfer ends with a screenshot of the bank app, and before
	 * this column that screenshot arrived by Telegram to somebody's phone. A
	 * link here is what makes the reconciliation queue self-contained: finance
	 * reads the statement line and the donor's evidence on one screen.
	 *
	 * Opens in a new tab rather than a preview: `/files/[name]` streams it with
	 * `private, no-store` and audits the read, and a thumbnail on every row
	 * would be dozens of audited reads nobody asked for.
	 */
	let { file, filename }: { file: string | null; filename: string | null } = $props();
</script>

{#if file}
	<a
		href="/files/{file}"
		target="_blank"
		rel="noopener"
		title={filename ?? 'Transfer receipt'}
		class="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline underline-offset-2"
	>
		<Paperclip class="size-3.5" />
		Receipt
		<ExternalLink class="size-3 opacity-60" />
	</a>
{:else}
	<Badge variant="outline" class="text-[10px] font-normal text-muted-foreground">None</Badge>
{/if}
