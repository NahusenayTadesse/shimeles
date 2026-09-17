<script lang="ts">
	import { page } from '$app/state';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import DarkMode from '$lib/components/DarkMode.svelte';
	import { Menu } from '@lucide/svelte';
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
		'site-header sticky top-0 z-40 w-full border-b border-(--gold)/35 bg-(--mist)/85 backdrop-blur-md transition-transform duration-300 ease-out motion-reduce:transition-none',
		hidden && !focusInside && !open && '-translate-y-full'
	)}
>
	<div class="wrap flex h-20 items-center gap-4 md:h-24">
		<a href="/" class="flex min-w-0 items-center gap-3">
			<img
				src="/favicon.png"
				alt=""
				width="44"
				height="44"
				class="size-11 shrink-0 rounded-full object-contain ring-1 ring-(--gold)/60 md:size-14"
			/>
			<!-- The two names are the same name, so they are one link: English in the
			     serif, the Amharic beneath it smaller, as a subtitle rather than a
			     second line competing for the same weight. -->
			<span class="flex min-w-0 flex-col">
				<span
					class="truncate font-serif text-lg leading-tight font-bold text-(--ink) md:text-[1.6rem]"
				>
					{siteName}
				</span>
				<span class="truncate text-sm leading-tight text-muted-foreground md:text-base"
					>{siteNameAmharic}</span
				>
			</span>
		</a>

		<nav class="ml-auto hidden items-center gap-2 lg:flex">
			{#each items.filter((item) => !item.isCta) as item (item.id)}
				<a
					href={item.href}
					aria-current={isActive(item.href) ? 'page' : undefined}
					class={cn(
						'relative px-3 py-2 text-[1.15rem] font-medium text-(--ink)/75 transition-colors hover:text-(--ink)',
						isActive(item.href) && 'text-(--ink)'
					)}
				>
					{item.label}
					{#if isActive(item.href)}
						<span class="absolute inset-x-3 bottom-0 h-[2px] bg-(--gold)"></span>
					{/if}
				</a>
			{/each}
		</nav>

		<div class="ml-auto flex items-center gap-2 lg:ml-2">
			<DarkMode />

			{#each items.filter((item) => item.isCta) as item (item.id)}
				<a
					href={item.href}
					class={cn(buttonVariants(), 'btn-gold hidden h-12 px-7 text-[1.1rem] sm:inline-flex')}
				>
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
				<Sheet.Content side="right" class="site-shell w-72">
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
</header>
