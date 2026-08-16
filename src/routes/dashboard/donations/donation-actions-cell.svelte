<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { CheckCircle2, Mail, Receipt, XCircle } from '@lucide/svelte';

	let {
		id,
		status,
		completedAt,
		receiptSentAt,
		hasEmail,
		fmt,
		onMatch
	}: {
		id: number;
		status: string;
		completedAt: Date | string | null;
		receiptSentAt: Date | string | null;
		hasEmail: boolean;
		fmt: (value: Date | string | null) => string;
		onMatch: (id: number) => void;
	} = $props();
</script>

<div class="flex items-center justify-end gap-2">
	{#if status === 'pending_reconciliation' || status === 'pledged'}
		<Button size="sm" onclick={() => onMatch(id)}>
			<CheckCircle2 class="size-4" /> Match
		</Button>

		<form
			method="post"
			action="?/setStatus"
			use:enhance={() => async ({ update }) => await update({ reset: false })}
		>
			<input type="hidden" name="id" value={id} />
			<input type="hidden" name="status" value="failed" />
			<Button type="submit" size="sm" variant="ghost" title="Never arrived">
				<XCircle class="size-4" />
			</Button>
		</form>
	{:else if status === 'completed'}
		<span class="flex items-center gap-1.5 text-xs text-success">
			<CheckCircle2 class="size-4" /> Confirmed {fmt(completedAt)}
		</span>
		{#if hasEmail}
			<form
				method="post"
				action="?/sendReceipt"
				use:enhance={() => async ({ update }) => await update({ reset: false })}
			>
				<input type="hidden" name="id" value={id} />
				<Button
					type="submit"
					size="sm"
					variant={receiptSentAt ? 'ghost' : 'outline'}
					title={receiptSentAt ? `Receipt sent ${fmt(receiptSentAt)}` : 'Send receipt'}
				>
					{#if receiptSentAt}
						<Mail class="size-4" />
					{:else}
						<Receipt class="size-4" /> Receipt
					{/if}
				</Button>
			</form>
		{/if}
	{:else}
		<Badge variant="outline" class="capitalize">{status.replace(/_/g, ' ')}</Badge>
	{/if}
</div>
