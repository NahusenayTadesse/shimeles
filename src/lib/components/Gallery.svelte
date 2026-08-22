<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { reveal, stagger } from '$lib/actions/reveal';
	import { assetUrl } from '$lib/assets';
	import { ChevronLeft, ChevronRight, X } from '@lucide/svelte';

	/**
	 * A photo gallery: a responsive thumbnail grid that opens onto a full-size
	 * lightbox with keyboard and click navigation. Generic over `{ storagePath,
	 * caption }` so any table shaped like `about_gallery_images` can feed it —
	 * today that is the In Memoriam gallery, and it is not written specifically
	 * for that table.
	 */
	let {
		images = []
	}: {
		images: { id: number; storagePath: string; caption?: string | null }[];
	} = $props();

	let openIndex = $state<number | null>(null);

	const open = (index: number) => (openIndex = index);
	const close = () => (openIndex = null);
	const step = (delta: number) => {
		if (openIndex === null) return;
		openIndex = (openIndex + delta + images.length) % images.length;
	};

	const onkeydown = (event: KeyboardEvent) => {
		if (openIndex === null) return;
		if (event.key === 'ArrowLeft') step(-1);
		else if (event.key === 'ArrowRight') step(1);
	};
</script>

<svelte:window {onkeydown} />

{#if images.length}
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
		{#each images as image, index (image.id)}
			<button
				type="button"
				use:reveal={{ delay: stagger(index, 60, 6) }}
				onclick={() => open(index)}
				class="group shadow-warm aspect-square overflow-hidden rounded-2xl bg-muted transition-transform hover:-translate-y-1"
			>
				<img
					src={assetUrl(image.storagePath)}
					alt={image.caption || ''}
					loading="lazy"
					class="size-full object-cover transition-transform duration-500 group-hover:scale-105"
				/>
			</button>
		{/each}
	</div>
{/if}

<Dialog.Root open={openIndex !== null} onOpenChange={(next) => !next && close()}>
	<Dialog.Content
		showCloseButton={false}
		class="max-w-4xl border-none bg-transparent p-0 shadow-none sm:max-w-4xl"
	>
		{#if openIndex !== null}
			{@const image = images[openIndex]}
			<div class="relative flex flex-col items-center gap-3">
				<Dialog.Title class="sr-only">{image.caption || 'Photograph'}</Dialog.Title>
				<img
					src={assetUrl(image.storagePath)}
					alt={image.caption || ''}
					class="max-h-[75vh] w-full rounded-2xl object-contain"
				/>
				{#if image.caption}
					<p class="text-center text-sm text-[oklch(0.97_0.01_80)]/80">{image.caption}</p>
				{/if}

				<Button
					variant="secondary"
					size="icon"
					class="absolute top-2 right-2 rounded-full"
					onclick={close}
					aria-label="Close"
				>
					<X class="size-4" />
				</Button>
				{#if images.length > 1}
					<Button
						variant="secondary"
						size="icon"
						class="absolute top-1/2 left-2 -translate-y-1/2 rounded-full"
						onclick={() => step(-1)}
						aria-label="Previous photo"
					>
						<ChevronLeft class="size-4" />
					</Button>
					<Button
						variant="secondary"
						size="icon"
						class="absolute top-1/2 right-2 -translate-y-1/2 rounded-full"
						onclick={() => step(1)}
						aria-label="Next photo"
					>
						<ChevronRight class="size-4" />
					</Button>
				{/if}
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
