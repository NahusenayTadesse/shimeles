<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageHero from '$lib/content/PageHero.svelte';
	import BlogCard, { accentClass, formatPostDate } from '$lib/content/BlogCard.svelte';
	import { reveal } from '$lib/actions/reveal';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { assetUrl } from '$lib/assets';
	import { cn } from '$lib/utils';
	import { ArrowRight, Clock, Search, X } from '@lucide/svelte';

	let { data } = $props();

	let query = $state(data.query);

	// The URL is the state: every filter is a link, so a filtered view can be
	// shared and the back button does the obvious thing.
	function applyFilter(key: string, value: string | null) {
		const url = new URL(page.url);
		if (value === null || value === '') url.searchParams.delete(key);
		else url.searchParams.set(key, value);
		url.searchParams.delete('page');
		goto(`${url.pathname}${url.search}`, { keepFocus: true, noScroll: true });
	}

	const pageHref = (n: number) => {
		const url = new URL(page.url);
		url.searchParams.set('page', String(n));
		return `${url.pathname}${url.search}`;
	};

	const hasFilters = $derived(Boolean(data.query || data.category));
	const siteName = $derived(data.settings?.['site.name'] || 'Shimeles Abera Foundation');
</script>

<svelte:head>
	<title>Blog · {siteName}</title>
	<meta
		name="description"
		content="Programme updates, field notes and stories from the families and volunteers the Foundation works with."
	/>
</svelte:head>

<PageHero
	eyebrow="From the Foundation"
	title="Blog"
	description="Programme updates, field notes, and stories from the families and volunteers we work alongside."
/>

<div class="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
	<!-- Filters -->
	<div use:reveal class="flex flex-col gap-4">
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				onclick={() => applyFilter('category', null)}
				class={cn(
					'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
					data.category === ''
						? 'border-primary bg-primary text-primary-foreground'
						: 'bg-card hover:bg-muted'
				)}
			>
				All posts
			</button>
			{#each data.categories as category (category.id)}
				<button
					type="button"
					onclick={() => applyFilter('category', category.slug)}
					class={cn(
						'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
						data.category === category.slug
							? 'border-primary bg-primary text-primary-foreground'
							: cn('hover:brightness-105', accentClass(category.color))
					)}
				>
					{category.name}
				</button>
			{/each}
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<div class="relative min-w-56 flex-1">
				<Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					bind:value={query}
					placeholder="Search posts…"
					aria-label="Search posts"
					class="rounded-full pl-9"
					onkeydown={(e) => e.key === 'Enter' && applyFilter('q', query)}
				/>
			</div>
			<Button variant="outline" class="rounded-full" onclick={() => applyFilter('q', query)}>
				Search
			</Button>
			{#if hasFilters}
				<Button
					variant="ghost"
					class="rounded-full"
					onclick={() => {
						query = '';
						goto('/blog');
					}}
				>
					<X class="size-4" /> Clear
				</Button>
			{/if}
		</div>

		{#if hasFilters}
			<p class="text-sm text-muted-foreground">
				{data.total}
				{data.total === 1 ? 'post' : 'posts'}
				{#if data.query}matching “{data.query}”{/if}
			</p>
		{/if}
	</div>

	<!-- The featured post, on the unfiltered first page only -->
	{#if data.featured}
		{@const featured = data.featured}
		<a
			href={`/blog/${featured.slug}`}
			use:reveal={{ delay: 80 }}
			class="group shadow-warm mt-10 grid overflow-hidden rounded-[2rem] border bg-card md:grid-cols-[1.05fr_0.95fr]"
		>
			<div class="aspect-[16/10] overflow-hidden bg-muted md:aspect-auto">
				{#if featured.coverImage}
					<img
						src={assetUrl(featured.coverImage)}
						alt=""
						class="size-full object-cover transition-transform duration-500 group-hover:scale-105"
					/>
				{/if}
			</div>
			<div class="flex flex-col justify-center gap-4 p-8 md:p-10">
				<p class="eyebrow">Featured</p>
				<h2 class="font-heading text-2xl leading-tight md:text-3xl">{featured.title}</h2>
				{#if featured.excerpt}
					<p class="text-muted-foreground">{featured.excerpt}</p>
				{/if}
				<div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
					{#if featured.category}
						<span
							class={cn(
								'rounded-full border px-3 py-1 font-medium',
								accentClass(featured.category.color)
							)}
						>
							{featured.category.name}
						</span>
					{/if}
					<span>{formatPostDate(featured.publishedAt)}</span>
					<span class="inline-flex items-center gap-1">
						<Clock class="size-3.5" />
						{featured.readMinutes} min read
					</span>
				</div>
				<span class="inline-flex w-fit items-center gap-2 font-medium text-primary">
					Read the story <ArrowRight
						class="size-4 transition-transform group-hover:translate-x-1"
					/>
				</span>
			</div>
		</a>
	{/if}

	<!-- The grid -->
	{#if data.posts.length}
		<div class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.posts as post, index (post.id)}
				<BlogCard {post} {index} />
			{/each}
		</div>
	{:else if !data.featured}
		<div use:reveal class="mt-10 rounded-[2rem] border border-dashed p-12 text-center">
			<p class="text-lg font-medium">Nothing here yet.</p>
			<p class="mt-2 text-muted-foreground">
				{#if hasFilters}
					No posts match that. Try a different category or search.
				{:else}
					The first posts are being written. Please check back soon.
				{/if}
			</p>
		</div>
	{/if}

	<!-- Pagination -->
	{#if data.pageCount > 1}
		<nav class="mt-12 flex flex-wrap items-center justify-center gap-2" aria-label="Pagination">
			{#each Array.from({ length: data.pageCount }, (_, i) => i + 1) as n (n)}
				<a
					href={pageHref(n)}
					aria-current={n === data.currentPage ? 'page' : undefined}
					class={buttonVariants({
						variant: n === data.currentPage ? 'default' : 'outline',
						size: 'icon'
					})}
				>
					{n}
				</a>
			{/each}
		</nav>
	{/if}
</div>
