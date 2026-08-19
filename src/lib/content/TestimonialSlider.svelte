<script lang="ts">
	import * as Carousel from '$lib/components/ui/carousel/index.js';
	import { assetUrl } from '$lib/assets';
	import { reveal } from '$lib/actions/reveal';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { ArrowRight, Quote } from '@lucide/svelte';
	import type { RenderTestimonial } from '$lib/content/types';

	/**
	 * The homepage slider — the handful of quotes flagged `is_featured`.
	 *
	 * One at a time and large, rather than the wall's grid: on the front page a
	 * single voice given room does more than six competing for attention.
	 */
	let {
		testimonials = [],
		showAllHref = '/testimonials'
	}: {
		testimonials: RenderTestimonial[];
		showAllHref?: string;
	} = $props();
</script>

{#if testimonials.length}
	<div use:reveal class="relative">
		<Carousel.Root opts={{ loop: testimonials.length > 1, align: 'start' }} class="w-full">
			<Carousel.Content>
				{#each testimonials as testimonial (testimonial.id)}
					<Carousel.Item>
						<figure
							class="shadow-warm flex flex-col items-center gap-6 rounded-[2rem] border bg-card px-6 py-12 text-center md:px-16"
						>
							<Quote class="size-9 text-olive" fill="currentColor" />

							<blockquote
								class="max-w-3xl font-heading text-xl leading-snug text-balance md:text-2xl"
							>
								“{testimonial.quote}”
							</blockquote>

							<figcaption class="flex flex-col items-center gap-3">
								{#if testimonial.photo}
									<img
										src={assetUrl(testimonial.photo)}
										alt=""
										loading="lazy"
										class="size-14 rounded-full object-cover"
									/>
								{/if}
								<div>
									<p class="font-medium">{testimonial.name}</p>
									{#if testimonial.role}
										<p class="text-sm text-muted-foreground">{testimonial.role}</p>
									{/if}
								</div>
							</figcaption>
						</figure>
					</Carousel.Item>
				{/each}
			</Carousel.Content>

			{#if testimonials.length > 1}
				<Carousel.Previous class="left-2 md:-left-6" />
				<Carousel.Next class="right-2 md:-right-6" />
			{/if}
		</Carousel.Root>

		<div class="mt-8 flex justify-center">
			<a href={showAllHref} class={buttonVariants({ variant: 'outline' })}>
				Read more of what people say
				<ArrowRight class="size-4" />
			</a>
		</div>
	</div>
{/if}
