<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible/index.js';
	import { page } from '$app/state';
	import { scale } from 'svelte/transition';
	import { cn } from '$lib/utils';
	import { activeChild, groupOwnsPath, ownsPath } from '$lib/dashboard/nav';

	let {
		sections,
		closeSidebar
	}: {
		sections: {
			section: string | null;
			items: {
				title: string;
				url: string;
				icon?: any;
				counter?: number;
				isActive?: boolean;
				items?: { title: string; url: string }[];
			}[];
		}[];
		closeSidebar: () => void;
	} = $props();

	const path = $derived(page.url.pathname);
	const matches = (url: string) => ownsPath(url, path);
	const groupActive = (item: { url: string; items?: { url: string }[] }) =>
		groupOwnsPath(item, path);
	const activeSub = (items?: { url: string }[]) => activeChild(items, path);

	const formatCount = (count: number): string => (count > 99 ? '99+' : String(count));

	/**
	 * Every link uses `sidebar-*` tokens, never the page's global `foreground`
	 * / `accent` ones — the sidebar tracks the site's light/dark mode but is a
	 * distinct surface, so its text and hover colors must come from its own
	 * palette to stay legible against it in both themes.
	 */
	const linkClass = (active: boolean) =>
		cn(
			'relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors duration-150',
			active
				? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground'
				: 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
		);
</script>

<nav class="px-2">
	{#each sections as { section, items } (section)}
		<div class="mb-1">
			{#if section}
				<div
					class="px-3 pt-3 pb-1 text-[9px] font-medium tracking-widest text-sidebar-foreground/50 uppercase"
				>
					{section}
				</div>
			{/if}

			{#each items as item (item.title)}
				{#if item.items}
					<!-- Collapsible group -->
					{@const activeChild = activeSub(item.items)}
					<Collapsible.Root open={groupActive(item)} class="group/collapsible">
						{#snippet child({ props })}
							<div {...props}>
								<!--
									The row is a link and the chevron is a button beside it, rather
									than a chevron nested inside a link. Nesting them meant the only
									way to expand a group without leaving the page you were on was a
									twelve-pixel span that no keyboard could reach; this is a
									full-height target with its own focus ring, and it still leaves
									the whole row leading where it says it leads.
								-->
								<div class="relative">
									<a
										href={item.url}
										onclick={closeSidebar}
										class={cn(linkClass(groupActive(item)), 'pr-9')}
									>
										{#if item.icon}
											<item.icon class="h-3.75 w-3.75 shrink-0 opacity-80" />
										{/if}
										<span class="flex-1 text-left">{item.title}</span>

										{#if (item.counter ?? 0) > 0}
											<span
												class="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-sidebar-accent px-1.5 text-[10px] font-semibold text-sidebar-accent-foreground"
												in:scale={{ duration: 200 }}
											>
												{formatCount(item.counter ?? 0)}
											</span>
										{/if}
									</a>

									<Collapsible.Trigger>
										{#snippet child({ props })}
											<button
												{...props}
												aria-label="{item.title} pages"
												class="absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-md opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
											>
												<svg
													class="h-3 w-3 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
													viewBox="0 0 12 12"
													fill="none"
													stroke="currentColor"
													stroke-width="1.5"
													stroke-linecap="round"
													stroke-linejoin="round"
												>
													<path d="M4 2l4 4-4 4" />
												</svg>
											</button>
										{/snippet}
									</Collapsible.Trigger>
								</div>

								<!-- Sub-items -->
								<Collapsible.Content>
									<div class="mt-0.5 ml-[26px] border-l border-sidebar-border pb-1 pl-2.5">
										{#each item.items ?? [] as sub (sub.title)}
											<a
												href={sub.url}
												onclick={closeSidebar}
												class={cn(
													'flex items-center gap-2 rounded-md px-2 py-[5px] text-[12px] no-underline transition-colors duration-150',
													activeChild === sub.url
														? 'bg-sidebar-primary font-medium text-sidebar-primary-foreground'
														: 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
												)}
											>
												<span
													class={cn(
														'h-1 w-1 shrink-0 rounded-full transition-colors',
														activeChild === sub.url
															? 'bg-sidebar-primary-foreground'
															: 'bg-sidebar-foreground/40'
													)}
												></span>
												{sub.title}
											</a>
										{/each}
									</div>
								</Collapsible.Content>
							</div>
						{/snippet}
					</Collapsible.Root>
				{:else}
					<!-- Plain link -->
					<div class="relative">
						<a href={item.url} onclick={closeSidebar} class={linkClass(matches(item.url))}>
							{#if item.icon}
								<item.icon class="h-[15px] w-[15px] shrink-0 opacity-80" />
							{/if}
							<span class="flex-1">{item.title}</span>

							{#if (item.counter ?? 0) > 0}
								<span
									class="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-sidebar-accent px-1.5 text-[10px] font-semibold text-sidebar-accent-foreground"
									in:scale={{ duration: 200 }}
								>
									{formatCount(item.counter ?? 0)}
								</span>
							{/if}
						</a>
					</div>
				{/if}
			{/each}
		</div>
	{/each}
</nav>
