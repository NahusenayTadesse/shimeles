<script lang="ts">
	import PageShell from '$lib/content/PageShell.svelte';
	import TrimBand from '$lib/components/trim-band.svelte';
	import HeroSlideshow from '$lib/components/hero-slideshow.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import { reveal } from '$lib/actions/reveal';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { ArrowRight, Heart, Sun, Users } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let { data } = $props();

	const s = (key: string) => data.settings?.[key] ?? '';
	const familiesSupported = $derived(data.metrics?.families_supported ?? 0);
	/** "Hope. Compassion. Opportunity." — one line per word beside the opening paragraph. */
	const taglineWords = $derived(
		s('site.tagline')
			.split('.')
			.map((word) => word.trim())
			.filter(Boolean)
	);
</script>

{#snippet tagline()}
	<div
		use:reveal={{ delay: 120, x: 24, y: 0 }}
		class="relative isolate overflow-hidden rounded-[2rem] border-2 border-olive/40 bg-card px-8 py-10 md:px-10 md:py-12"
	>
		<div
			class="pointer-events-none absolute -top-20 -right-16 -z-10 size-64 rounded-full bg-olive/30 blur-3xl"
			aria-hidden="true"
		></div>
		<Sun class="mb-5 size-9 text-olive" aria-hidden="true" />
		<ul class="flex flex-col gap-1" aria-label={s('site.tagline')}>
			{#each taglineWords as word, index (word)}
				<li
					use:reveal={{ delay: 200 + index * 110, x: 16, y: 0 }}
					class={cn(
						'font-heading text-3xl font-bold tracking-tight md:text-4xl',
						index === 0 ? 'text-olive' : 'text-foreground'
					)}
				>
					{word}<span class="text-olive">.</span>
				</li>
			{/each}
		</ul>
	</div>
{/snippet}

<PageShell
	page={data.page}
	pillars={data.pillars}
	initiatives={data.initiatives}
	charts={data.charts}
	metrics={data.metrics}
	moneyTotals={data.moneyTotals}
	payments={data.payments}
	settings={data.settings}
	testimonials={data.testimonials}
	ledeAside={taglineWords.length ? tagline : undefined}
>
	{#snippet header()}
		<div
			class="hero-night relative isolate flex min-h-[70svh] flex-col overflow-hidden text-(--hero-cream) md:min-h-[88svh]"
		>
			<HeroSlideshow images={data.heroGallery} fallbackImage={s('hero.image')} />

			<div
				class="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-6 px-4 pt-24 pb-28 md:pt-28 md:pb-32"
			>
				<p
					use:reveal
					class="eyebrow flex w-fit items-center gap-2 rounded-full border border-olive/40 bg-(--hero-shade)/40 px-4 py-1.5 text-olive-bright backdrop-blur-sm"
				>
					<Sun class="size-3.5" />
					A family foundation · Addis Ababa
				</p>
				<h1
					use:reveal={{ delay: 70, y: 32 }}
					class="hero-headline max-w-3xl text-4xl text-balance drop-shadow-[0_2px_24px_oklch(0.18_0.04_170/60%)] md:text-6xl lg:text-7xl"
				>
					{s('hero.headline') || 'Nobody should face the hardest days alone.'}
				</h1>
				<span
					use:reveal={{ delay: 110, x: -24, y: 0 }}
					class="hero-rule h-1.5 w-24 rounded-full"
					aria-hidden="true"
				></span>
				{#if s('hero.subheadline')}
					<p
						use:reveal={{ delay: 150, y: 28 }}
						class="max-w-xl text-lg text-(--hero-cream)/90 md:text-xl"
					>
						{s('hero.subheadline')}
					</p>
				{/if}
				<div use:reveal={{ delay: 230, y: 24 }} class="flex flex-wrap items-center gap-3 pt-2">
					<a
						href="/donate"
						class={cn(
							buttonVariants({ size: 'lg' }),
							'hero-give bg-olive text-(--hero-shade) hover:bg-olive-bright'
						)}
					>
						<Heart class="size-4" fill="currentColor" />
						Give to the Foundation
						<ArrowRight class="size-4" />
					</a>
					<a
						href="/programs"
						class={cn(
							buttonVariants({ variant: 'outline', size: 'lg' }),
							'border-(--hero-cream)/40 bg-(--hero-cream)/10 text-(--hero-cream) backdrop-blur-sm hover:bg-(--hero-cream)/20 hover:text-(--hero-cream) dark:border-(--hero-cream)/40 dark:bg-(--hero-cream)/10'
						)}
					>
						See our programmes
					</a>
				</div>

				{#if familiesSupported > 0}
					<div
						use:reveal={{ delay: 320, y: 20 }}
						class="mt-6 flex w-fit items-center gap-3 rounded-2xl border border-olive/30 bg-(--hero-shade)/45 px-4 py-3 backdrop-blur-md"
					>
						<span
							class="flex size-10 items-center justify-center rounded-full bg-olive text-(--hero-shade)"
						>
							<Users class="size-5" />
						</span>
						<span class="flex flex-col leading-tight">
							<span class="font-heading text-xl font-bold text-olive-bright">
								{familiesSupported.toLocaleString()}+
							</span>
							<span class="text-xs text-(--hero-cream)/80">Families supported</span>
						</span>
					</div>
				{/if}
			</div>

			<TrimBand festive class="relative" />
		</div>
	{/snippet}

	{#if data.gallery.length}
		<TrimBand festive class="mt-20 rounded-full md:mt-28" />
		<section class="mt-16 md:mt-20">
			<div class="mb-8 flex flex-col gap-2">
				<h2 class="text-3xl md:text-4xl">Moments from the work</h2>
				<span class="h-3 w-14 rounded-full bg-olive"></span>
			</div>
			<Gallery images={data.gallery} />
		</section>
	{/if}
</PageShell>
