<script lang="ts">
	import * as Carousel from '$lib/components/ui/carousel/index.js';
	import type { CarouselAPI } from '$lib/components/ui/carousel/context.js';
	import VideoEmbed from '$lib/content/VideoEmbed.svelte';
	import { reveal } from '$lib/actions/reveal';
	import { Play } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	/**
	 * One video, or several as a carousel.
	 *
	 * A single clip renders exactly as it always did — no arrows, no dots, no
	 * chrome around a thing there is only one of. The carousel appears only when
	 * there is something to move between.
	 *
	 * **Only the slide you are looking at holds a player.** The others are
	 * placeholders until you reach them, which buys two things:
	 *
	 *  - Five YouTube players do not load on a page showing five clips. Each one
	 *    is a few hundred kilobytes of someone else's JavaScript.
	 *  - A video does not keep talking after you have swiped past it. Unmounting
	 *    the iframe stops the sound, which no amount of CSS would.
	 *
	 * The placeholders are drawn locally rather than from YouTube's thumbnail
	 * CDN on purpose. `$lib/youtube` embeds through `youtube-nocookie.com` so
	 * that a reader looking at a page about medical hardship is not logged
	 * against Google before they have touched anything, and pulling a thumbnail
	 * from `ytimg.com` on page load would give that away for a nicer picture.
	 */
	let {
		videos = [],
		title = 'Video',
		class: className = ''
	}: {
		videos: { id: number; youtubeUrl: string; caption: string | null }[];
		/** Falls back as the iframe's accessible name when a clip has no caption. */
		title?: string;
		class?: string;
	} = $props();

	let api = $state<CarouselAPI>();
	let selected = $state(0);

	$effect(() => {
		if (!api) return;
		const carousel = api;

		const onSelect = () => (selected = carousel.selectedScrollSnap());
		onSelect();
		carousel.on('select', onSelect);
		carousel.on('reInit', onSelect);

		return () => {
			carousel.off('select', onSelect);
			carousel.off('reInit', onSelect);
		};
	});
</script>

{#if videos.length === 1}
	<VideoEmbed url={videos[0].youtubeUrl} caption={videos[0].caption} {title} />
{:else if videos.length > 1}
	<div use:reveal class={cn('relative', className)}>
		<Carousel.Root setApi={(value) => (api = value)} opts={{ align: 'start' }} class="w-full">
			<Carousel.Content>
				{#each videos as video, index (video.id)}
					<Carousel.Item>
						{#if index === selected}
							<VideoEmbed url={video.youtubeUrl} caption={video.caption} {title} animate={false} />
						{:else}
							<!-- Not yet loaded. Pressing it moves the carousel here, which
							     is what mounts the player. -->
							<figure class="flex flex-col gap-3">
								<button
									type="button"
									onclick={() => api?.scrollTo(index)}
									aria-label={`Play ${video.caption || `video ${index + 1}`}`}
									class="shadow-warm group flex aspect-video w-full items-center justify-center overflow-hidden rounded-[1.5rem] border bg-muted transition hover:border-primary/60"
								>
									<span
										class="flex size-16 items-center justify-center rounded-full bg-background/80 text-primary shadow-sm transition group-hover:scale-105"
									>
										<Play class="size-7 translate-x-0.5" fill="currentColor" />
									</span>
								</button>

								{#if video.caption}
									<figcaption class="text-sm text-muted-foreground">{video.caption}</figcaption>
								{/if}
							</figure>
						{/if}
					</Carousel.Item>
				{/each}
			</Carousel.Content>

			<Carousel.Previous class="left-2 md:-left-6" />
			<Carousel.Next class="right-2 md:-right-6" />
		</Carousel.Root>

		<!-- Dots, and the count in words for anyone who cannot see them.
		     The button is padded to a 24px tap target with the dot drawn inside
		     it: an 8px dot is the right size to look at and the wrong size to
		     hit with a thumb. -->
		<div class="mt-4 flex items-center justify-center">
			{#each videos as video, index (video.id)}
				<button
					type="button"
					onclick={() => api?.scrollTo(index)}
					aria-label={`Go to video ${index + 1}`}
					aria-current={index === selected}
					class="flex size-6 items-center justify-center"
				>
					<span
						class={cn(
							'h-2 rounded-full transition-all',
							index === selected ? 'w-6 bg-primary' : 'w-2 bg-border hover:bg-muted-foreground/40'
						)}
					></span>
				</button>
			{/each}
		</div>

		<p class="mt-2 text-center text-xs text-muted-foreground" aria-live="polite">
			Video {selected + 1} of {videos.length}
		</p>
	</div>
{/if}
