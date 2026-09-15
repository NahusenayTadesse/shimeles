<script lang="ts">
	import { page } from '$app/state';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import DarkMode from '$lib/components/DarkMode.svelte';
	import TrimBand from '$lib/components/trim-band.svelte';
	import { Menu, HeartHandshake } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import type { RenderNavItem } from '$lib/content/types';

	/**
	 * The public header.
	 *
	 * Every link comes from `navigation_items` — there is no hardcoded list of
	 * pages here, so adding "Our Team" to the site is a dashboard row (§0). The
	 * only fixed elements are the wordmark and the theme toggle, neither of
	 * which is content.
	 */
	let {
		items = [],
		siteName = 'Shimeles Abera Foundation',
		siteNameAmharic = 'ሽመልስ አበራ ፋውንዴሽን'
	}: { items?: RenderNavItem[]; siteName?: string; siteNameAmharic: string } = $props();

	let open = $state(false);

	/**
	 * On a phone the header steps out of the way while the visitor reads
	 * downwards, and comes back the moment they scroll up — the gesture people
	 * already use to look for the menu. On a wide screen there is room for it,
	 * so it stays. It never hides near the top of the page, while the menu is
	 * open, or while focus is inside it (a keyboard user tabbing through).
	 */
	let hidden = $state(false);
	let lastY = 0;
	let focusInside = $state(false);

	function onScroll() {
		const y = window.scrollY;
		const delta = y - lastY;
		lastY = y;
		if (window.matchMedia('(min-width: 1024px)').matches || y < 120 || open) {
			hidden = false;
		} else if (Math.abs(delta) > 6) {
			hidden = delta > 0;
		}
	}

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<svelte:window onscroll={onScroll} />

<header
	onfocusin={() => (focusInside = true)}
	onfocusout={() => (focusInside = false)}
	class={cn(
		'site-header sticky top-0 z-40 w-full bg-background/85 backdrop-blur transition-transform duration-300 ease-out supports-[backdrop-filter]:bg-background/70 motion-reduce:transition-none',
		hidden && !focusInside && !open && '-translate-y-full'
	)}
>
	<div class="mx-auto flex h-20 w-full max-w-6xl items-center gap-4 px-4">
		<a href="/" class="group flex min-w-0 items-center gap-3 leading-tight">
			<img
				src="/favicon.png"
				alt=""
				class="size-11 shrink-0 rounded-full object-contain ring-2 ring-olive/40 transition-transform group-hover:-rotate-6"
			/>
			<span class="text-md truncate font-heading font-semibold"
				>{siteName}
				<br />
				{siteNameAmharic}
			</span>
		</a>

		<nav class="ml-auto hidden items-center gap-1 lg:flex">
			{#each items.filter((item) => !item.isCta) as item (item.id)}
				<a
					href={item.href}
					aria-current={isActive(item.href) ? 'page' : undefined}
					class={cn(
						'relative rounded-full px-4 py-2 text-sm font-medium text-foreground/75 transition-colors hover:text-foreground',
						isActive(item.href) && 'text-primary'
					)}
				>
					{item.label}
					{#if isActive(item.href)}
						<span class="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-olive"></span>
					{/if}
				</a>
			{/each}
		</nav>

		<div class="ml-auto flex items-center gap-2 lg:ml-0">
			<DarkMode />

			{#each items.filter((item) => item.isCta) as item (item.id)}
				<a
					href={item.href}
					class={cn(buttonVariants({ size: 'sm' }), 'hidden gap-1.5 sm:inline-flex')}
				>
					<HeartHandshake class="size-3.5" />
					{item.label}
				</a>
			{/each}

			<Sheet.Root bind:open>
				<Sheet.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon"
							class="rounded-full lg:hidden"
							aria-label="Open menu"
						>
							<Menu class="size-5" />
						</Button>
					{/snippet}
				</Sheet.Trigger>
				<Sheet.Content side="right" class="w-72">
					<Sheet.Header>
						<Sheet.Title class="font-heading">{siteName}</Sheet.Title>
					</Sheet.Header>
					<nav class="flex flex-col gap-1 p-4">
						{#each items as item (item.id)}
							<a
								href={item.href}
								onclick={() => (open = false)}
								aria-current={isActive(item.href) ? 'page' : undefined}
								class={cn(
									buttonVariants({ variant: item.isCta ? 'default' : 'ghost' }),
									'h-12 justify-start px-4 text-base',
									!item.isCta &&
										isActive(item.href) &&
										'bg-accent font-semibold text-accent-foreground'
								)}
							>
								{item.label}
							</a>
						{/each}
					</nav>
				</Sheet.Content>
			</Sheet.Root>
		</div>
	</div>

	<TrimBand thin />
</header>
