<script lang="ts">
	import { onMount } from 'svelte';
	import { assetUrl, imageSrcset } from '$lib/assets';
	import { cn } from '$lib/utils';

	/**
	 * The homepage hero's photographs — the dashboard-managed `hero` photo set,
	 * one at a time and crossfading inside whatever frame the page gives it (on
	 * the homepage, the arch). The photographs are not under any text, so they
	 * are shown as they are: no shade, no tint. With no photos it falls back to
	 * the single `hero.image` setting; with neither it draws nothing.
	 *
	 * Motion is decoration here, so it stops for `prefers-reduced-motion`, for a
	 * hidden tab, and while the visitor is choosing a slide with the dots.
	 *
	 * And with data saving on (`navigator.connection.saveData`, the phone's own
	 * setting, or `prefers-reduced-data`) it is one photograph and no more: the
	 * rest of the set is never downloaded, and there are no dots to ask for it.
	 */
	let {
		images,
		fallbackImage,
		interval = 6500,
		class: className = ''
	}: {
		images: { id: number; storagePath: string; caption?: string | null }[];
		fallbackImage?: string | null;
		interval?: number;
		/** The frame: its shape, size and radius. The slides fill it. */
		class?: string;
	} = $props();

	const slides = $derived(
		images.length
			? images.map((image) => ({
					key: String(image.id),
					src: assetUrl(image.storagePath),
					srcset: imageSrcset(image.storagePath),
					alt: image.caption ?? ''
				}))
			: fallbackImage
				? [
						{
							key: 'fallback',
							src: assetUrl(fallbackImage),
							srcset: imageSrcset(fallbackImage),
							alt: ''
						}
					]
				: []
	);

	let current = $state(0);
	/** The slide fading out — it keeps its slow zoom so it does not snap back mid-fade. */
	let previous = $state(-1);
	let paused = $state(false);
	let reducedMotion = $state(false);
	let saveData = $state(false);
	/** Every slide normally; only the first when the visitor is saving data. */
	const shown = $derived(saveData ? slides.slice(0, 1) : slides);
	/** Slides that have been shown at least once — only those get a real `src`. */
	let loaded = $state(new Set<number>([0]));

	function show(index: number) {
		if (index === current) return;
		previous = current;
		current = (index + shown.length) % shown.length;
		loaded = new Set([...loaded, current, (current + 1) % shown.length]);
	}

	onMount(() => {
		const query = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = query.matches;
		const onChange = (event: MediaQueryListEvent) => (reducedMotion = event.matches);
		query.addEventListener('change', onChange);
		const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
			.connection;
		saveData =
			connection?.saveData === true || window.matchMedia('(prefers-reduced-data: reduce)').matches;
		// Warm the second slide once the page has settled, so the first crossfade
		// never fades into a half-decoded photo.
		if (slides.length > 1 && !saveData) loaded = new Set([0, 1]);
		return () => query.removeEventListener('change', onChange);
	});

	$effect(() => {
		if (shown.length < 2 || paused || reducedMotion) return;
		const timer = setInterval(() => {
			if (!document.hidden) show(current + 1);
		}, interval);
		return () => clearInterval(timer);
	});
</script>

{#if shown.length}
	<div class={cn('relative overflow-hidden bg-(--night)', className)}>
		{#each shown as slide, index (slide.key)}
			<div
				class={cn(
					'hero-slide absolute inset-0 transition-opacity duration-[1800ms] ease-in-out',
					index === current ? 'opacity-100' : 'opacity-0'
				)}
				aria-hidden={index !== current}
			>
				{#if loaded.has(index)}
					<img
						src={slide.src}
						srcset={slide.srcset}
						sizes="(min-width: 768px) 32rem, 80vw"
						alt={slide.alt}
						class={cn(
							'size-full object-cover',
							(index === current || index === previous) && !reducedMotion && 'ken-burns'
						)}
						style:animation-duration="{interval + 2500}ms"
						fetchpriority={index === 0 ? 'high' : 'auto'}
						loading={index === 0 ? 'eager' : 'lazy'}
						decoding="async"
					/>
				{/if}
			</div>
		{/each}
	</div>

	{#if shown.length > 1}
		<div class="mt-5 flex items-center gap-2">
			{#each shown as slide, index (slide.key)}
				<button
					type="button"
					onclick={() => show(index)}
					onmouseenter={() => (paused = true)}
					onmouseleave={() => (paused = false)}
					onfocus={() => (paused = true)}
					onblur={() => (paused = false)}
					aria-label="Show photo {index + 1} of {shown.length}"
					aria-current={index === current}
					class="grid size-6 place-items-center"
				>
					<span
						class={cn(
							'block h-1.5 rounded-full transition-all duration-500',
							index === current ? 'w-6 bg-(--gold)' : 'w-1.5 bg-(--honey)/40'
						)}
					></span>
				</button>
			{/each}
		</div>
	{/if}
{/if}

<style>
	.ken-burns {
		animation-name: ken-burns;
		animation-timing-function: linear;
		animation-fill-mode: both;
	}

	@keyframes ken-burns {
		from {
			transform: scale(1.02);
		}
		to {
			transform: scale(1.1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hero-slide {
			transition: none;
		}
	}
</style>
