<script lang="ts">
	import { reveal, stagger } from '$lib/actions/reveal';
	import { Play } from '@lucide/svelte';
	import { parseYouTubeUrl, youtubeEmbedUrl, youtubeWatchUrl } from '$lib/youtube';

	/**
	 * A pasted YouTube link, rendered as a player.
	 *
	 * The markup is ours rather than YouTube's suggested snippet — see
	 * `$lib/youtube`. A link that cannot be parsed renders nothing at all: a
	 * blank 16:9 box telling a reader something went wrong is worse than the
	 * absence of a video they never knew was meant to be there.
	 *
	 * **Nothing is loaded from YouTube until the reader presses play.** The
	 * iframe used to be in the page from the start, `loading="lazy"` and all,
	 * and About paid 900 KB of player JavaScript for a video most readers never
	 * watched — on a throttled phone that is several seconds of a page that had
	 * already finished its own work.
	 *
	 * The panel below is drawn locally rather than from `i.ytimg.com`, which is
	 * the usual trick. A poster fetched from Google's CDN would log the reader's
	 * address before they touched anything, and this module already chose
	 * `youtube-nocookie` over the ordinary host for exactly that reason: this
	 * site publishes about medical hardship and mental health. If a real
	 * thumbnail is ever wanted here, that is the trade being made.
	 */
	let {
		url,
		caption = null,
		title = 'Video',
		index = 0,
		animate = true
	}: {
		url: string;
		caption?: string | null;
		/** Used for the iframe's accessible name. */
		title?: string;
		index?: number;
		/**
		 * Fade-and-rise on first sight. Turned off inside `VideoCarousel`: the
		 * reveal action hides an element until it intersects the viewport, and a
		 * slide waiting off to the side would either sit invisible or replay the
		 * animation on every swipe. Neither is what a carousel should do.
		 */
		animate?: boolean;
	} = $props();

	const video = $derived(parseYouTubeUrl(url));

	let playing = $state(false);
</script>

{#if video}
	<figure
		use:reveal={animate ? { delay: stagger(index, 70, 4) } : { duration: 0, y: 0, threshold: 0 }}
		class="flex flex-col gap-3"
	>
		<div class="shadow-warm relative overflow-hidden rounded-[1.5rem] border bg-muted">
			{#if playing}
				<iframe
					src={youtubeEmbedUrl(video, true)}
					title={caption || title}
					class="aspect-video w-full"
					referrerpolicy="strict-origin-when-cross-origin"
					allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
					allowfullscreen
				></iframe>
			{:else}
				<button
					type="button"
					onclick={() => (playing = true)}
					aria-label={caption ? `Play video: ${caption}` : `Play ${title}`}
					class="group relative flex aspect-video w-full items-center justify-center bg-gradient-to-br from-clay via-clay-deep to-clay transition-colors"
				>
					<span
						class="pointer-events-none absolute inset-0 opacity-40"
						style="background-image: radial-gradient(circle at 78% 22%, color-mix(in oklch, var(--olive) 35%, transparent), transparent 55%);"
						aria-hidden="true"
					></span>
					<span
						class="relative flex size-16 items-center justify-center rounded-full bg-olive text-clay-deep shadow-lg transition-transform duration-300 group-hover:scale-110 md:size-20"
					>
						<Play class="ml-1 size-7 fill-current md:size-9" />
					</span>
				</button>
			{/if}
		</div>

		{#if caption}
			<figcaption class="text-sm text-muted-foreground">
				{caption}
				<a
					href={youtubeWatchUrl(video)}
					target="_blank"
					rel="noopener noreferrer"
					class="ml-1 underline underline-offset-2"
				>
					Watch on YouTube
				</a>
			</figcaption>
		{/if}
	</figure>
{/if}
