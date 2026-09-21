<script lang="ts">
	import { ChevronRight } from '@lucide/svelte';

	/**
	 * The visible trail on a page more than one step from the homepage — a
	 * programme, a blog post. Takes the same array the page already hands `<Seo>`
	 * for its `BreadcrumbList`, so what a visitor sees and what Google reads can
	 * never disagree.
	 *
	 * Shown only for three steps or more: on a top-level page "Home › About" says
	 * nothing the highlighted header link does not already say.
	 */
	let {
		items,
		label = 'You are here'
	}: { items: { name: string; path: string }[]; label?: string } = $props();
</script>

{#if items.length >= 3}
	<nav aria-label={label} class="text-sm text-muted-foreground">
		<ol class="flex flex-wrap items-center gap-1">
			{#each items as item, index (item.path)}
				<li class="flex min-w-0 items-center gap-1">
					{#if index === items.length - 1}
						<span aria-current="page" class="truncate font-medium text-foreground">
							{item.name}
						</span>
					{:else}
						<a
							href={item.path}
							class="rounded-sm underline-offset-4 hover:text-foreground hover:underline"
						>
							{item.name}
						</a>
						<ChevronRight class="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
					{/if}
				</li>
			{/each}
		</ol>
	</nav>
{/if}
