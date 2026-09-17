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
			<li class="font-serif text-[clamp(2rem,1rem+2.8vw,4rem)] leading-tight font-bold">{word}.</li>
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
		<!-- Fills the window on a desktop: the header is 5–6rem, the hero is the
     rest of the screen, so the page opens as one picture. -->
		<section
			class="on-forest relative isolate flex overflow-hidden bg-(--forest) md:min-h-[calc(100svh-6rem)]"
		>
			<div
				class="wrap grid items-center gap-12 pt-8 pb-20 md:grid-cols-2 md:gap-[clamp(3rem,6vw,9rem)] md:py-[clamp(3rem,6vh,6rem)]"
			>
				<!-- The photographs come first on a phone: a person, before a sentence. -->
				<div class="relative order-2 flex flex-col gap-7 md:order-1">
					{#if greeting}
						<p
							use:reveal={{ orchestrate: true }}
							class="text-[clamp(1.15rem,0.9rem+0.6vw,1.6rem)] font-medium text-(--gold)"
						>
							{#if greetingHref}
								<a href={greetingHref} class="link-quiet">{greeting}</a>
							{:else}
								{greeting}
							{/if}
						</p>
					{/if}

					<h1
						use:reveal={{ orchestrate: true, delay: 80 }}
						class="text-[clamp(3rem,1.5rem+5.6vw,8rem)] text-[#f6f3e6]"
					>
						{s('hero.headline') || 'Nobody should face the hardest days alone.'}
					</h1>

					{#if s('hero.subheadline')}
						<p
							use:reveal={{ orchestrate: true, delay: 160 }}
							class="max-w-[38ch] text-[clamp(1.2rem,0.9rem+0.9vw,1.9rem)] leading-relaxed"
						>
							{s('hero.subheadline')}
						</p>
					{/if}

					<div
						use:reveal={{ orchestrate: true, delay: 240 }}
						class="flex flex-wrap items-center gap-x-9 gap-y-4 pt-2"
					>
						<a
							href="/donate"
							class={cn(
								buttonVariants({ size: 'lg' }),
								'btn-gold h-14 px-9 text-[1.15rem] md:h-16 md:px-11 md:text-[1.3rem]'
							)}
						>
							Give to the Foundation
						</a>
						<a
							href="/programs"
							class="link-quiet text-[clamp(1.15rem,0.9rem+0.6vw,1.5rem)] font-medium text-[#f6f3e6]"
						>
							See our programmes
						</a>
					</div>

					{#if familiesSupported > 0}
						<p class="text-[clamp(1.05rem,0.9rem+0.4vw,1.35rem)] text-(--honey)/80">
							<span class="font-serif text-[1.6em] font-bold text-(--gold) lining-nums">
								{familiesSupported.toLocaleString()}
							</span>
							{familiesSupported === 1 ? 'family' : 'families'} supported so far
						</p>
					{/if}
				</div>

				<!-- The arch. A gold sun rises behind it as the page opens, and a gold
				     outline of the same doorway sits just off its shoulder. -->
				<!-- As large as the window allows: its height is the screen less the
     header and breathing room, and its width follows the 4:5 arch. -->
				<div
					class="relative order-1 w-[82%] max-w-[30rem] md:order-2 md:w-[min(100%,calc((100svh-13rem)*0.8))] md:max-w-none md:justify-self-end"
				>
					<div
						class="hero-sun pointer-events-none absolute -top-10 -right-12 -z-10 size-44 rounded-full md:-top-[12%] md:-right-[18%] md:size-[55%]"
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
		<section class="mt-24 md:mt-40">
			<h2 class="mb-10 text-[clamp(2.4rem,1.4rem+3.2vw,5rem)]">Moments from the work</h2>
			<Gallery images={data.gallery} />
		</section>
	{/if}
</PageShell>
