<script lang="ts">
	import { page } from '$app/state';
	import LinkCue from '$lib/components/link-cue.svelte';
	import type { RenderNavItem } from '$lib/content/types';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils';

	/**
	 * "Where to next", above the footer on every public page, so reaching the
	 * bottom of a page is never a dead end.
	 *
	 * Built from the header's own `navigation_items` rather than a list of its
	 * own (§0): the pages that follow this one in the menu, wrapping round, and
	 * the call-to-action item unless the visitor is already on it. Reordering
	 * the menu in the dashboard reorders these too.
	 */
	let { items = [], heading = 'Where to next' }: { items?: RenderNavItem[]; heading?: string } =
		$props();

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);

	const links = $derived(items.filter((item) => !item.isCta));
	const next = $derived.by(() => {
		const current = links.findIndex((item) => isActive(item.href));
		if (current === -1) return links.slice(0, 3);
		return [...links.slice(current + 1), ...links.slice(0, current)].slice(0, 3);
	});
	const cta = $derived(items.find((item) => item.isCta && !isActive(item.href)));
</script>

{#if next.length || cta}
	<!-- A row of plain serif links over a gold hairline, and the call to action
	     as the one gold button. It sits at the foot of the page, so it should
	     read as the page's last sentence, not as another section of cards. -->
	<nav aria-labelledby="next-steps-heading" class="wrap mt-8">
		<div
			class="flex flex-col gap-6 border-t border-(--gold)/50 pt-10 md:flex-row md:items-baseline md:gap-12"
		>
			<h2
				id="next-steps-heading"
				class="shrink-0 font-sans text-[clamp(1.1rem,0.9rem+0.5vw,1.45rem)] font-medium text-(--gold-deep)"
			>
				{heading}
			</h2>
			<ul class="flex flex-wrap items-baseline gap-x-[clamp(1.5rem,3vw,4rem)] gap-y-4">
				{#each next as item (item.id)}
					<li>
						<a
							href={item.href}
							class="link-quiet font-serif text-[clamp(1.6rem,1rem+1.7vw,2.75rem)] font-bold"
						>
							{item.label}
							<LinkCue class="size-[0.6em]" />
						</a>
					</li>
				{/each}
				{#if cta}
					<li>
						<a
							href={cta.href}
							class={cn(buttonVariants({ size: 'lg' }), 'btn-gold h-14 px-9 text-[1.15rem]')}
						>
							<LinkCue kind={cta.href.startsWith('/donate') ? 'give' : 'next'} />
							{cta.label}
						</a>
					</li>
				{/if}
			</ul>
		</div>
	</nav>
{/if}
