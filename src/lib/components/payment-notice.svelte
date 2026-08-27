<script lang="ts">
	import { ShieldCheck } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	/**
	 * "No money moves on this website."
	 *
	 * Said wherever a donor is looking at the means of paying: under the bank
	 * details, under the card platforms, and once at the top of the donate page.
	 * Three wordings rather than one, because the reassurance a donor needs in
	 * front of an account number ("the transfer happens at your bank") is not
	 * the one they need in front of a PayPal button ("your card details are
	 * entered on their site").
	 *
	 * Both languages are shown at once, English then Amharic. There is no switch
	 * here on purpose: this is the paragraph somebody reads when they are unsure
	 * whether to trust the page, and a notice you have to press a button to read
	 * in your own language is a notice that goes unread. A blank Amharic setting
	 * simply renders the English alone.
	 *
	 * The text is `site_settings` (§0) — a notice about what the Foundation does
	 * and does not do with money is exactly the sentence a board may want
	 * reworded without waiting on a deploy.
	 */
	let {
		en = '',
		am = '',
		tone = 'quiet',
		class: className = ''
	}: {
		en?: string;
		am?: string;
		/** `loud` for the page-level notice; `quiet` under a list of details. */
		tone?: 'loud' | 'quiet';
		class?: string;
	} = $props();
</script>

{#if en?.trim()}
	<div
		class={cn(
			'flex items-start gap-2.5 rounded-xl border p-3.5',
			tone === 'loud'
				? 'border-primary/30 bg-primary/5'
				: 'border-border bg-muted/40 text-muted-foreground',
			className
		)}
	>
		<ShieldCheck class={cn('mt-0.5 size-4 shrink-0', tone === 'loud' && 'text-primary')} />
		<div class="flex min-w-0 flex-col gap-1.5">
			<p class={cn('text-xs leading-relaxed', tone === 'loud' && 'text-sm font-medium')}>
				{en}
			</p>
			{#if am?.trim()}
				<p lang="am" class="text-xs leading-relaxed opacity-90">{am}</p>
			{/if}
		</div>
	</div>
{/if}
