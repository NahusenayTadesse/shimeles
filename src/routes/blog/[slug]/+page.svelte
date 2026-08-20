<script lang="ts">
	import PageHero from '$lib/content/PageHero.svelte';
	import BlogCard, { accentClass, formatPostDate } from '$lib/content/BlogCard.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import VideoCarousel from '$lib/content/VideoCarousel.svelte';
	import SectionHeading from '$lib/components/section-heading.svelte';
	import { reveal } from '$lib/actions/reveal';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils';
	import { ArrowLeft, Clock, HeartHandshake } from '@lucide/svelte';

	let { data } = $props();

	const post = $derived(data.post);
	const siteName = $derived(data.settings?.['site.name'] || 'Shimeles Abera Foundation');
	const description = $derived(post.metaDescription || post.excerpt || '');
</script>

<svelte:head>
	<title>{post.title} · {siteName}</title>
	{#if description}<meta name="description" content={description} />{/if}
	<meta property="og:type" content="article" />
	<meta property="og:title" content={`${post.title} · ${siteName}`} />
	{#if description}<meta property="og:description" content={description} />{/if}
	{#if post.coverImage}<meta property="og:image" content={`/files/${post.coverImage}`} />{/if}
</svelte:head>

<PageHero
	eyebrow={post.category?.name ?? 'From the Foundation'}
	title={post.title}
	description={post.excerpt}
	image={post.coverImage}
	imageAlt={post.title}
>
	{#snippet actions()}
		<div class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
			{#if post.category}
				<span
					class={cn('rounded-full border px-3 py-1 font-medium', accentClass(post.category.color))}
				>
					{post.category.name}
				</span>
			{/if}
			<span>{formatPostDate(post.publishedAt)}</span>
			<span class="inline-flex items-center gap-1">
				<Clock class="size-3.5" />
				{post.readMinutes} min read
			</span>
			{#if post.authorName}<span>By {post.authorName}</span>{/if}
		</div>
	{/snippet}
</PageHero>

<article class="mx-auto w-full max-w-3xl px-4 py-16 md:py-24">
	{#if post.body}
		<!-- Authored in the dashboard's rich-text editor. -->
		<div use:reveal class="prose-block prose-lede">
			{@html post.body}
		</div>
	{/if}

	{#if post.videos.length}
		<div class="mt-16">
			<SectionHeading title="Watch" eyebrow={post.videos.length === 1 ? 'Video' : 'Videos'} />
			<div class="mt-8">
				<VideoCarousel videos={post.videos} title={post.title} />
			</div>
		</div>
	{/if}

	{#if post.gallery.length}
		<div class="mt-16">
			<SectionHeading title="From the day" eyebrow="Photographs" />
			<div class="mt-8">
				<Gallery images={post.gallery} />
			</div>
		</div>
	{/if}

	<div class="mt-16 flex flex-wrap items-center gap-3 border-t pt-8">
		<a href="/blog" class={buttonVariants({ variant: 'outline' })}>
			<ArrowLeft class="size-4" /> All posts
		</a>
		<a href="/donate" class={buttonVariants()}>
			<HeartHandshake class="size-4" /> Support this work
		</a>
	</div>
</article>

{#if data.related.length}
	<section class="border-t bg-muted/40">
		<div class="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
			<SectionHeading title="More from the Foundation" eyebrow="Keep reading" />
			<div class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.related as related, index (related.id)}
					<BlogCard post={related} {index} />
				{/each}
			</div>
		</div>
	</section>
{/if}
