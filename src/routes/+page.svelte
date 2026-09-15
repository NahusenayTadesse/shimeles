<script lang="ts">
	import PageShell from '$lib/content/PageShell.svelte';
	import HeroSlideshow from '$lib/components/hero-slideshow.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import { reveal } from '$lib/actions/reveal';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
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

	/**
	 * The seasonal greeting (`season.*` in Site settings) is a line above the
	 * headline, in the hero's own voice, rather than a strip across the top of
	 * every page. Shown only when it is switched on and has words.
	 */
	const greeting = $derived(
		s('season.banner_enabled') === 'true' ? s('season.banner_message').trim() : ''
	);
	const greetingHref = $derived(s('season.banner_link'));
</script>

{#snippet tagline()}
	<ul
		class="flex flex-col gap-2 border-l-2 border-(--gold) py-2 pl-6"
		aria-label={s('site.tagline')}
	>
		{#each taglineWords as word (word)}
			<li class="font-serif text-3xl leading-tight font-bold md:text-4xl">{word}.</li>
		{/each}
	</ul>
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
		<section class="on-forest relative isolate overflow-hidden bg-(--forest)">
			<div
				class="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-8 pb-20 md:grid-cols-[1.15fr_0.85fr] md:gap-16 md:pt-16 md:pb-28"
			>
				<!-- The photographs come first on a phone: a person, before a sentence. -->
				<div class="relative order-2 flex flex-col gap-7 md:order-1">
					{#if greeting}
						<p use:reveal={{ orchestrate: true }} class="text-lg font-medium text-(--gold)">
							{#if greetingHref}
								<a href={greetingHref} class="link-quiet">{greeting}</a>
							{:else}
								{greeting}
							{/if}
						</p>
					{/if}

					<h1
						use:reveal={{ orchestrate: true, delay: 80 }}
						class="text-[clamp(2.6rem,6.2vw,4.9rem)] text-[#f6f3e6]"
					>
						{s('hero.headline') || 'Nobody should face the hardest days alone.'}
					</h1>

					{#if s('hero.subheadline')}
						<p
							use:reveal={{ orchestrate: true, delay: 160 }}
							class="max-w-xl text-lg leading-relaxed md:text-xl"
						>
							{s('hero.subheadline')}
						</p>
					{/if}

					<div
						use:reveal={{ orchestrate: true, delay: 240 }}
						class="flex flex-wrap items-center gap-x-7 gap-y-4 pt-1"
					>
						<a href="/donate" class={cn(buttonVariants({ size: 'lg' }), 'btn-gold h-12 px-7')}>
							Give to the Foundation
						</a>
						<a href="/programs" class="link-quiet text-lg font-medium text-[#f6f3e6]">
							See our programmes
						</a>
					</div>

					{#if familiesSupported > 0}
						<p class="text-base text-(--honey)/80">
							<span class="font-serif text-2xl font-bold text-(--gold) lining-nums">
								{familiesSupported.toLocaleString()}
							</span>
							{familiesSupported === 1 ? 'family' : 'families'} supported so far
						</p>
					{/if}
				</div>

				<!-- The arch. A gold sun rises behind it as the page opens, and a gold
				     outline of the same doorway sits just off its shoulder. -->
				<div
					class="relative order-1 w-[78%] max-w-[26rem] md:order-2 md:w-full md:justify-self-end"
				>
					<div
						class="hero-sun pointer-events-none absolute -top-10 -right-12 -z-10 size-44 rounded-full md:-top-16 md:-right-20 md:size-72"
						aria-hidden="true"
					></div>
					<div
						class="arch-line pointer-events-none absolute inset-x-0 top-0 -z-10 translate-x-4 translate-y-4 md:translate-x-6 md:translate-y-6"
						aria-hidden="true"
					></div>
					<HeroSlideshow
						images={data.heroGallery}
						fallbackImage={s('hero.image')}
						class="arch w-full"
					/>
				</div>
			</div>
		</section>
	{/snippet}

	{#if data.gallery.length}
		<section class="mt-24 md:mt-32">
			<h2 class="mb-10 text-[clamp(1.9rem,3.4vw,2.7rem)]">Moments from the work</h2>
			<Gallery images={data.gallery} />
		</section>
	{/if}
</PageShell>
