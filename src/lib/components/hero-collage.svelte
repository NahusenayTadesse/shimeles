<script lang="ts">
	import { reveal, stagger } from '$lib/actions/reveal';
	import { assetUrl } from '$lib/assets';
	import { cn } from '$lib/utils';

	/**
	 * The homepage hero's photo side. Draws from the dashboard-managed
	 * `hero_gallery_images` set (§ dashboard/homepage) rather than the single
	 * `hero.image` setting the header used to be pinned to — a program manager
	 * adds photos, this arranges them.
	 *
	 * The whole block is height-bound (never past ~90% of the viewport) and
	 * every layout below fills that box exactly — a fixed 2-row grid rather
	 * than one tall tile next to an auto-flowing stack, which is what used to
	 * let a 4th photo push the collage taller than everything beside it.
	 */
	let {
		images,
		fallbackImage
	}: {
		images: { id: number; storagePath: string; caption?: string | null }[];
		fallbackImage?: string | null;
	} = $props();

	const photos = $derived(images.slice(0, 4));

	const frame = 'h-full w-full rounded-[2rem] object-cover shadow-warm';
	const box = 'h-[48vh] min-h-[20rem] sm:h-[58vh] lg:h-[74vh] lg:max-h-[90vh]';
</script>

{#if photos.length >= 2}
	<div class={cn(box, 'grid gap-4', photos.length === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2')}>
		{#if photos.length === 2}
			<img
				use:reveal={{ x: -20, scale: 0.96 }}
				src={assetUrl(photos[0].storagePath)}
				alt={photos[0].caption ?? ''}
				class={cn('tilt-left', frame)}
			/>
			<img
				use:reveal={{ x: 20, scale: 0.96, delay: 90 }}
				src={assetUrl(photos[1].storagePath)}
				alt={photos[1].caption ?? ''}
				class={cn('tilt-right', frame)}
			/>
		{:else if photos.length === 3}
			<img
				use:reveal={{ x: -20, scale: 0.96 }}
				src={assetUrl(photos[0].storagePath)}
				alt={photos[0].caption ?? ''}
				class={cn('tilt-left row-span-2', frame)}
			/>
			<img
				use:reveal={{ x: 20, scale: 0.96, delay: 90 }}
				src={assetUrl(photos[1].storagePath)}
				alt={photos[1].caption ?? ''}
				class={cn('tilt-right', frame)}
			/>
			<img
				use:reveal={{ x: 20, scale: 0.96, delay: 180 }}
				src={assetUrl(photos[2].storagePath)}
				alt={photos[2].caption ?? ''}
				class={cn('tilt-left', frame)}
			/>
		{:else}
			{#each photos as photo, index (photo.id)}
				<img
					use:reveal={{ x: index % 2 === 0 ? -20 : 20, scale: 0.96, delay: stagger(index, 90, 90) }}
					src={assetUrl(photo.storagePath)}
					alt={photo.caption ?? ''}
					class={cn(index % 2 === 0 ? 'tilt-left' : 'tilt-right', frame)}
				/>
			{/each}
		{/if}
	</div>
{:else if photos.length === 1 || fallbackImage}
	<img
		use:reveal={{ scale: 0.97 }}
		src={assetUrl(photos[0]?.storagePath ?? fallbackImage ?? '')}
		alt={photos[0]?.caption ?? ''}
		class={cn('tilt-right rounded-[2.5rem]', box, 'w-full object-cover shadow-warm')}
	/>
{/if}
