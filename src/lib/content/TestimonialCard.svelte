<script lang="ts">
	import { reveal, stagger } from '$lib/actions/reveal';
	import { assetUrl } from '$lib/assets';
	import { cn } from '$lib/utils';
	import { Quote } from '@lucide/svelte';
	import type { RenderTestimonial } from '$lib/content/types';

	/** One quote, as a card on the testimonials wall. */
	let {
		testimonial,
		index = 0
	}: {
		testimonial: RenderTestimonial;
		index?: number;
	} = $props();

	const accent = $derived(
		{
			clay: 'text-clay bg-clay/10 border-clay/25',
			olive: 'text-olive-bright bg-olive/10 border-olive/30',
			plum: 'text-plum bg-plum/10 border-plum/25',
			sky: 'text-sky bg-sky/10 border-sky/25'
		}[testimonial.pillar?.color ?? ''] ?? 'text-primary bg-primary/10 border-primary/25'
	);
</script>

<figure
	use:reveal={{ delay: stagger(index, 70, 6) }}
	class="shadow-warm flex h-full flex-col gap-4 rounded-[1.75rem] border bg-card p-6"
>
	<Quote class="size-7 shrink-0 text-olive" fill="currentColor" />

	<blockquote class="flex-1 font-heading text-lg leading-snug">
		“{testimonial.quote}”
	</blockquote>

	<figcaption class="flex items-center gap-3 border-t pt-4">
		{#if testimonial.photo}
			<img
				src={assetUrl(testimonial.photo)}
				alt=""
				loading="lazy"
				class="size-11 shrink-0 rounded-full object-cover"
			/>
		{/if}
		<div class="min-w-0">
			<p class="font-medium">{testimonial.name}</p>
			{#if testimonial.role}
				<p class="truncate text-sm text-muted-foreground">{testimonial.role}</p>
			{/if}
		</div>
		{#if testimonial.pillar}
			<span class={cn('ml-auto rounded-full border px-3 py-1 text-xs font-medium', accent)}>
				{testimonial.pillar.name}
			</span>
		{/if}
	</figcaption>
</figure>
