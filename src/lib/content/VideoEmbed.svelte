<script lang="ts">
	import { reveal, stagger } from '$lib/actions/reveal';
	import { parseYouTubeUrl, youtubeEmbedUrl, youtubeWatchUrl } from '$lib/youtube';

	/**
	 * A pasted YouTube link, rendered as a player.
	 *
	 * The markup is ours rather than YouTube's suggested snippet — see
	 * `$lib/youtube`. A link that cannot be parsed renders nothing at all: a
	 * blank 16:9 box telling a reader something went wrong is worse than the
	 * absence of a video they never knew was meant to be there.
	 */
	let {
		url,
		caption = null,
		title = 'Video',
		index = 0
	}: {
		url: string;
		caption?: string | null;
		/** Used for the iframe's accessible name. */
		title?: string;
		index?: number;
	} = $props();

	const video = $derived(parseYouTubeUrl(url));
</script>

{#if video}
	<figure use:reveal={{ delay: stagger(index, 70, 4) }} class="flex flex-col gap-3">
		<div class="shadow-warm overflow-hidden rounded-[1.5rem] border bg-muted">
			<iframe
				src={youtubeEmbedUrl(video)}
				title={caption || title}
				class="aspect-video w-full"
				loading="lazy"
				referrerpolicy="strict-origin-when-cross-origin"
				allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
				allowfullscreen
			></iframe>
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
