<script lang="ts">
	import { onMount } from 'svelte';
	import { assetUrl, imageSrcset } from '$lib/assets';
	import { cn } from '$lib/utils';

	/**
	 * The homepage hero's background — the dashboard-managed `hero` photo set,
	 * shown full-bleed one at a time and crossfading, with the forest green laid
	 * over it and a gold dawn light rising from the bottom so the headline always
	 * sits on something readable. With no photos it falls back to the single
	 * `hero.image` setting; with none of either it is only the light.
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
		interval = 6500
	}: {
		images: { id: number; storagePath: string; caption?: string | null }[];
		fallbackImage?: string | null;
		interval?: number;
	} = $props();

	const slides = $derived(
		images.length
			? images.map((image) => ({
					key: String(image.id),
					src: assetUrl(image.storagePath),
					srcset: imageSrcset(image.storagePath)
				}))
			: fallbackImage
				? [
						{
							key: 'fallback',
							src: assetUrl(fallbackImage),
							srcset: imageSrcset(fallbackImage)
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

<div
	class="hero-slideshow absolute inset-0 -z-10 overflow-hidden bg-(--hero-shade)"
	aria-hidden="true"
>
	{#each shown as slide, index (slide.key)}
		<div
			class={cn(
				'hero-slide absolute inset-0 transition-opacity duration-[1800ms] ease-in-out',
				index === current ? 'opacity-100' : 'opacity-0'
			)}
		>
			{#if loaded.has(index)}
				<img
					src={slide.src}
					srcset={slide.srcset}
					sizes="100vw"
					alt=""
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

	<!-- Forest shade: deepest behind the text on the left, lifting to the right. -->
	<div
		class="absolute inset-0 bg-gradient-to-r from-(--hero-shade)/90 via-(--hero-shade)/55 to-(--hero-shade)/10"
	></div>
	<!-- On a phone the text spans the whole photo, so the right side needs shade too. -->
	<div class="absolute inset-0 bg-(--hero-shade)/35 md:hidden"></div>
	<!-- The dawn: a gold light rising from below, and a warm sun off the right edge. -->
	<div class="hero-dawn absolute inset-0"></div>
	<div class="hero-sun absolute -right-40 -bottom-56 size-[42rem] rounded-full"></div>
</div>

{#if shown.length > 1}
	<div class="absolute right-4 bottom-10 z-10 flex items-center gap-2 md:right-8 md:bottom-14">
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
				class={cn(
					'h-1.5 rounded-full transition-all duration-500 focus-visible:ring-2 focus-visible:ring-olive-bright focus-visible:outline-none',
					index === current
						? 'w-8 bg-olive-bright'
						: 'w-3 bg-(--hero-cream)/45 hover:bg-(--hero-cream)/75'
				)}
			></button>
		{/each}
	</div>
{/if}

<style>
	.hero-dawn {
		background:
			radial-gradient(
				120% 70% at 70% 105%,
				color-mix(in oklch, var(--olive-bright) 55%, transparent) 0%,
				color-mix(in oklch, var(--olive) 22%, transparent) 40%,
				transparent 70%
			),
			linear-gradient(
				to top,
				color-mix(in oklch, var(--olive) 30%, transparent) 0%,
				transparent 45%
			),
			linear-gradient(to bottom, oklch(0.18 0.04 170 / 50%), transparent 28%);
		mix-blend-mode: screen;
	}

	.hero-sun {
		background: radial-gradient(
			circle,
			color-mix(in oklch, var(--olive-bright) 75%, transparent) 0%,
			color-mix(in oklch, var(--olive) 35%, transparent) 38%,
			transparent 68%
		);
		filter: blur(12px);
		animation: sun-breathe 9s ease-in-out infinite alternate;
	}

	.ken-burns {
		animation-name: ken-burns;
		animation-timing-function: linear;
		animation-fill-mode: both;
	}

	@keyframes ken-burns {
		from {
			transform: scale(1.02) translate3d(0, 0, 0);
		}
		to {
			transform: scale(1.12) translate3d(-1.5%, -1%, 0);
		}
	}

	@keyframes sun-breathe {
		from {
			opacity: 0.7;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1.05);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.hero-sun {
			animation: none;
		}
		.hero-slide {
			transition: none;
		}
	}
</style>
