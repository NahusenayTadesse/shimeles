<script lang="ts">
	import { page } from '$app/state';
	import { ArrowRight, HeartHandshake } from '@lucide/svelte';
	import type { RenderNavItem } from '$lib/content/types';
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
	<nav aria-labelledby="next-steps-heading" class="mx-auto w-full max-w-6xl px-4 pb-16 md:pb-20">
		<h2 id="next-steps-heading" class="eyebrow mb-4">{heading}</h2>
		<ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each next as item (item.id)}
				<li>
					<a
						href={item.href}
						class="group flex min-h-14 items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4 font-heading font-semibold transition-colors hover:border-olive/60 hover:bg-accent"
					>
						{item.label}
						<ArrowRight
							class="size-4 shrink-0 text-olive transition-transform group-hover:translate-x-1"
						/>
					</a>
				</li>
			{/each}
			{#if cta}
				<li>
					<a
						href={cta.href}
						class={cn(
							'gold-surface group flex min-h-14 items-center justify-between gap-3 rounded-2xl px-5 py-4 font-heading font-semibold'
						)}
					>
						<span class="flex items-center gap-2">
							<HeartHandshake class="size-4" />
							{cta.label}
						</span>
						<ArrowRight class="size-4 shrink-0 transition-transform group-hover:translate-x-1" />
					</a>
				</li>
			{/if}
		</ul>
	</nav>
{/if}
