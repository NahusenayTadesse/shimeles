<script lang="ts">
	import { page } from '$app/state';
	import { ChevronRight } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import { activeChild, currentEntity, visibleSections } from '$lib/dashboard/nav';
	import type { Permission } from '$lib/permissions';

	/**
	 * The entity bar: every page of the entity you are inside, across the top.
	 *
	 * The sidebar can say where you are, but only while it is open and only
	 * once the right group is expanded — on a laptop it is collapsed and on a
	 * phone it is not on screen at all. Someone editing volunteer skills should
	 * be able to see that skills, groups, time slots, the safeguarding
	 * checklist and the applications themselves are one thing, and step
	 * between them, without going back out to a menu.
	 *
	 * It reads the same tree the sidebar and the palette read, filtered by the
	 * same permissions, so a page added to `nav.ts` gets its tab for free and a
	 * tab can never point somewhere the sidebar would have hidden.
	 */
	let {
		permissions = [],
		counts = {}
	}: { permissions?: Permission[]; counts?: Record<string, number> } = $props();

	const sections = $derived(visibleSections(counts, permissions));
	const entity = $derived(currentEntity(sections, page.url.pathname));
	const current = $derived(activeChild(entity?.items, page.url.pathname));
	const tab = $derived(entity?.items?.find((item) => item.url === current));

	/**
	 * A record's own page — a volunteer, an application, one blog post — sits
	 * below a tab rather than on it. The tab bar alone cannot say that: it
	 * highlights "All volunteers" whether you are looking at the list or at
	 * somebody inside it, and it never says who.
	 *
	 * So a page deeper than its tab draws a trail. What it is called has to
	 * come from the page, which is the only thing that knows a reference
	 * number from a name, so a load returns `crumb` (or `crumbs`, for a page
	 * two levels down). A page that returns neither still gets the way back.
	 */
	const isDeep = $derived(current !== null && page.url.pathname !== current);

	type Crumb = { label: string; url?: string };

	const crumbs = $derived.by<Crumb[]>(() => {
		const supplied =
			(page.data as Record<string, unknown>)?.crumbs ??
			(page.data as Record<string, unknown>)?.crumb;
		if (typeof supplied === 'string') return supplied ? [{ label: supplied }] : [];
		if (Array.isArray(supplied)) return supplied.filter((entry) => entry && entry.label);
		return [];
	});
</script>

{#if entity}
	<div class="mb-4 border-b border-border">
		<div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pt-1">
			{#if entity.icon}
				<entity.icon class="h-4 w-4 shrink-0 text-muted-foreground" />
			{/if}
			<span class="font-heading text-sm font-semibold">{entity.title}</span>

			<!--
				The tabs scroll rather than wrap on a narrow screen: a bar that
				grows to three lines pushes the page's own heading off the top,
				which is the thing it was meant to help you find.
			-->
			<nav
				aria-label="{entity.title} pages"
				class="-mb-px flex min-w-0 flex-1 [scrollbar-width:none] items-end gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden"
			>
				{#each entity.items ?? [] as tab (tab.url)}
					<a
						href={tab.url}
						aria-current={current === tab.url ? 'page' : undefined}
						class={cn(
							'shrink-0 border-b-2 px-3 py-2 text-[13px] whitespace-nowrap no-underline transition-colors duration-150',
							current === tab.url
								? 'border-primary font-medium text-foreground'
								: 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
						)}
					>
						{tab.title}
					</a>
				{/each}
			</nav>
		</div>

		{#if isDeep && current}
			<div class="flex flex-wrap items-center gap-1 px-2 pt-1 pb-2 text-xs text-muted-foreground">
				<a href={current} class="no-underline hover:text-foreground hover:underline">
					{tab?.title ?? entity.title}
				</a>
				{#each crumbs as crumb, index (crumb.label + index)}
					<ChevronRight class="size-3 shrink-0 opacity-60" />
					{#if crumb.url && index < crumbs.length - 1}
						<a href={crumb.url} class="no-underline hover:text-foreground hover:underline">
							{crumb.label}
						</a>
					{:else}
						<span class="font-medium text-foreground">{crumb.label}</span>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
{/if}
