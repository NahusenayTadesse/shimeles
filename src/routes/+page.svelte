<script lang="ts">
	import PageShell from '$lib/content/PageShell.svelte';
	import TrimBand from '$lib/components/trim-band.svelte';
	import HeroCollage from '$lib/components/hero-collage.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import { reveal } from '$lib/actions/reveal';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { ArrowRight, Heart, Users } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let { data } = $props();

	const s = (key: string) => data.settings?.[key] ?? '';
	const familiesSupported = $derived(data.metrics?.families_supported ?? 0);
</script>

<PageShell
	page={data.page}
	pillars={data.pillars}
	initiatives={data.initiatives}
	metrics={data.metrics}
	moneyTotals={data.moneyTotals}
	payments={data.payments}
	settings={data.settings}
	testimonials={data.testimonials}
>
	{#snippet header()}
		<div class="relative overflow-hidden">
			<div
				class="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-olive/12 via-transparent to-transparent"
				aria-hidden="true"
			></div>
			<div
				class="dot-field pointer-events-none absolute top-16 right-8 -z-10 size-40 text-olive/40 md:size-56"
				aria-hidden="true"
			></div>
			<div
				class="pointer-events-none absolute top-1/3 -left-20 -z-10 size-72 rounded-full bg-clay/10 blur-3xl"
				aria-hidden="true"
			></div>

			<div
				class="relative mx-auto grid w-full max-w-6xl items-start gap-12 px-4 pt-28 pb-20 md:grid-cols-[1.05fr_0.95fr] md:pt-32 md:pb-24"
			>
				<div class="flex flex-col gap-5 md:pt-6">
					<p
						use:reveal
						class="eyebrow flex w-fit items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-accent-foreground"
					>
						<Heart class="size-3.5" fill="currentColor" />
						A family foundation · Addis Ababa
					</p>
					<h1 use:reveal={{ delay: 70, y: 32 }} class="max-w-xl text-4xl md:text-6xl">
						{s('hero.headline') || 'Nobody should face the hardest days alone.'}
					</h1>
					{#if s('hero.subheadline')}
						<p use:reveal={{ delay: 150, y: 28 }} class="max-w-lg text-lg text-muted-foreground">
							{s('hero.subheadline')}
						</p>
					{/if}
					<div use:reveal={{ delay: 230, y: 24 }} class="flex flex-wrap gap-3 pt-2">
						<a href="/donate" class={cn(buttonVariants({ size: 'lg' }), 'shadow-warm')}>
							Give to the Foundation
							<ArrowRight class="size-4" />
						</a>
						<a href="/programs" class={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
							See our programmes
						</a>
					</div>
				</div>

				<div use:reveal={{ delay: 120, y: 20 }} class="relative">
					<HeroCollage images={data.heroGallery} fallbackImage={s('hero.image')} />

					{#if familiesSupported > 0}
						<div
							class="floating-badge absolute -bottom-6 -left-6 flex items-center gap-3 md:-bottom-8 md:-left-8"
						>
							<span
								class="flex size-10 items-center justify-center rounded-full bg-clay text-primary-foreground"
							>
								<Users class="size-5" />
							</span>
							<span class="flex flex-col leading-tight">
								<span class="font-heading text-xl font-bold text-foreground">
									{familiesSupported.toLocaleString()}+
								</span>
								<span class="text-xs text-muted-foreground">Families supported</span>
							</span>
						</div>
					{/if}
				</div>
			</div>

			<TrimBand class="relative w-full" />
		</div>
	{/snippet}

	{#if data.gallery.length}
		<section class="mt-20 md:mt-28">
			<div class="mb-8 flex flex-col gap-2">
				<h2 use:reveal class="text-3xl md:text-4xl">Moments from the work</h2>
				<span class="h-3 w-14 rounded-full bg-olive"></span>
			</div>
			<Gallery images={data.gallery} />
		</section>
	{/if}
</PageShell>
