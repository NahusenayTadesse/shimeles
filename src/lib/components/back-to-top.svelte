<script lang="ts">
	import { ArrowUp } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	/**
	 * "Back to top", in the bottom right corner once a visitor is well into a
	 * page — two screens down — and gone again near the top. The homepage,
	 * About and the programme pages with an application form are all long
	 * enough to need it.
	 *
	 * Returning focus matters as much as returning the view: a keyboard user
	 * who presses it lands on the first link in the header, not somewhere in
	 * the footer they have scrolled away from.
	 */
	let { label = 'Back to top' }: { label?: string } = $props();

	let visible = $state(false);

	function onScroll() {
		visible = window.scrollY > window.innerHeight * 2;
	}

	function toTop() {
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		// Focus first, then scroll: moving focus while a smooth scroll is under
		// way cancels the scroll in Chromium, even with `preventScroll`.
		document.querySelector<HTMLElement>('header a[href]')?.focus({ preventScroll: true });
		window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
	}
</script>

<svelte:window onscroll={onScroll} />

<button
	type="button"
	onclick={toTop}
	aria-label={label}
	tabindex={visible ? 0 : -1}
	aria-hidden={!visible}
	class={cn(
		'btn-gold fixed right-4 bottom-4 z-30 flex h-12 items-center gap-2 rounded-full px-4 font-bold transition-[opacity,transform] duration-300 motion-reduce:transition-none md:right-6 md:bottom-6 md:px-5',
		visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
	)}
>
	<ArrowUp class="size-5" aria-hidden="true" />
	<span class="hidden md:inline">{label}</span>
</button>
