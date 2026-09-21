<script lang="ts">
	import { ArrowDown, ArrowRight, Heart } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	/**
	 * The small mark at the end of a link that says where it goes. Each shape
	 * means one thing everywhere on the public site, which is what makes it
	 * worth having — a visitor learns it on the first page and can rely on it
	 * after that:
	 *
	 * - `next` →  opens another page.
	 * - `down` ↓  jumps further down this page (an application form below).
	 * - `give` ♥  goes to giving.
	 *
	 * Decorative to assistive technology: the link's own words already say
	 * where it goes. It nudges in its own direction when the link is hovered.
	 */
	let {
		kind = 'next',
		class: className = ''
	}: { kind?: 'next' | 'down' | 'give'; class?: string } = $props();
</script>

{#if kind === 'down'}
	<ArrowDown
		class={cn('link-cue link-cue--down size-[1.05em] shrink-0', className)}
		aria-hidden="true"
	/>
{:else if kind === 'give'}
	<Heart
		class={cn('link-cue link-cue--give size-[0.95em] shrink-0', className)}
		fill="currentColor"
		aria-hidden="true"
	/>
{:else}
	<ArrowRight
		class={cn('link-cue link-cue--next size-[1.05em] shrink-0', className)}
		aria-hidden="true"
	/>
{/if}
