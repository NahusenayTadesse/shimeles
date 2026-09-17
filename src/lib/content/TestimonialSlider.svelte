<script lang="ts">
	import * as Carousel from '$lib/components/ui/carousel/index.js';
	import { assetUrl, imageSrcset } from '$lib/assets';
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
	<div class="relative">
		<Carousel.Root opts={{ loop: testimonials.length > 1, align: 'start' }} class="w-full">
			<Carousel.Content>
				{#each testimonials as testimonial (testimonial.id)}
					<Carousel.Item>
						<!-- A voice, given the width of the page: the quote in the serif,
						     large, with the person beneath it. No card, no quotation-mark
						     ornament — the typographic quotes already say it. -->
						<figure class="flex max-w-4xl flex-col gap-8 md:px-14">
							<blockquote class="text-[clamp(1.9rem,1rem+2.8vw,3.75rem)] leading-[1.2] text-pretty">
								“{testimonial.quote}”
							</blockquote>
							<figcaption class="flex items-center gap-4">
								{#if testimonial.photo}
									<img
										src={assetUrl(testimonial.photo)}
										srcset={imageSrcset(testimonial.photo)}
										sizes="96px"
										alt=""
										loading="lazy"
										class="size-14 rounded-full object-cover ring-1 ring-(--gold)"
									/>
								{/if}
								<div>
									<p class="font-serif text-xl font-bold">{testimonial.name}</p>
									{#if testimonial.role}
										<p class="text-muted-foreground">{testimonial.role}</p>
									{/if}
								</div>
							</figcaption>
						</figure>
					</Carousel.Item>
				{/each}
			</Carousel.Content>

			{#if testimonials.length > 1}
				<Carousel.Previous
					class="top-auto -bottom-16 left-0 translate-y-0 md:top-1/2 md:bottom-auto md:-left-2 md:-translate-y-1/2"
				/>
				<Carousel.Next
					class="top-auto -bottom-16 left-12 translate-y-0 md:top-1/2 md:right-0 md:bottom-auto md:left-auto md:-translate-y-1/2"
				/>
			{/if}
		</Carousel.Root>

		<div class="mt-24 md:mt-10 md:pl-14">
			<a href={showAllHref} class="link-quiet font-medium">Read more of what people say</a>
		</div>
	</div>
{/if}
