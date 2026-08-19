<script lang="ts" module>
	/**
	 * Accent classes for a category chip, keyed by `blog_categories.color`.
	 * Written out rather than interpolated because Tailwind only ships classes
	 * it can see in the source — `bg-${color}/10` compiles to nothing.
	 */
	export const accentClass = (color: string | undefined) =>
		({
			clay: 'text-clay bg-clay/10 border-clay/25',
			olive: 'text-olive-bright bg-olive/10 border-olive/30',
			plum: 'text-plum bg-plum/10 border-plum/25',
			sky: 'text-sky bg-sky/10 border-sky/25'
		})[color ?? ''] ?? 'text-primary bg-primary/10 border-primary/25';

	export const formatPostDate = (value: number | null) =>
		value
			? new Intl.DateTimeFormat('en-GB', {
					day: 'numeric',
					month: 'long',
					year: 'numeric'
				}).format(new Date(value))
			: '';
</script>

<script lang="ts">
	import { reveal, stagger } from '$lib/actions/reveal';
	import { assetUrl } from '$lib/assets';
	import { cn } from '$lib/utils';
	import { Clock } from '@lucide/svelte';
	import type { RenderBlogPost } from '$lib/content/types';

	/** One post as a card in the `/blog` grid. */
	let { post, index = 0 }: { post: RenderBlogPost; index?: number } = $props();
</script>

<a
	href={`/blog/${post.slug}`}
	use:reveal={{ delay: stagger(index, 70, 6) }}
	class="group shadow-warm flex flex-col overflow-hidden rounded-[1.75rem] border bg-card transition-transform hover:-translate-y-1"
>
	<div class="aspect-[16/10] overflow-hidden bg-muted">
		{#if post.coverImage}
			<img
				src={assetUrl(post.coverImage)}
				alt=""
				loading="lazy"
				class="size-full object-cover transition-transform duration-500 group-hover:scale-105"
			/>
		{/if}
	</div>

	<div class="flex flex-1 flex-col gap-3 p-6">
		<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
		</div>

		<h3 class="font-heading text-xl leading-snug group-hover:underline">{post.title}</h3>

		{#if post.excerpt}
			<p class="line-clamp-3 text-sm text-muted-foreground">{post.excerpt}</p>
		{/if}

		{#if post.authorName}
			<p class="mt-auto pt-2 text-xs text-muted-foreground">By {post.authorName}</p>
		{/if}
	</div>
</a>
