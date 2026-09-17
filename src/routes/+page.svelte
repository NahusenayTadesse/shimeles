<script lang="ts">
	import PageShell from '$lib/content/PageShell.svelte';
	import HeroSlideshow from '$lib/components/hero-slideshow.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import { reveal } from '$lib/actions/reveal';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { isMoneyMetric, METRIC, METRIC_LABELS, type MetricKey } from '$lib/metrics';
	import { toMajor } from '$lib/money';
	import { cn } from '$lib/utils';

	let { data } = $props();

	const s = (key: string) => data.settings?.[key] ?? '';

	/** "Hope. Compassion. Opportunity." — one line per word beside the opening paragraph. */
	const taglineWords = $derived(
		s('site.tagline')
			.split('.')
			.map((word) => word.trim())
			.filter(Boolean)
	);

	/**
	 * What the Foundation has done so far, for the corner of the hero.
	 *
	 * The figures and their labels come from the page's own counters block, so
	 * a staff member renaming "Families supported" or dropping a counter changes
	 * the hero too. With no counters block on the page it falls back to the four
	 * headline metrics under their standard names. A figure that is still zero
	 * is left out: the opening screen says what has been done, not what has not
	 * started yet.
	 */
	const accomplishments = $derived.by(() => {
		const block = data.page.blocks.find((candidate) => candidate.type === 'stat_counter');
		type Stat = { metric?: string; label?: string; suffix?: string };
		const stats: Stat[] = Array.isArray(block?.content.stats)
			? (block.content.stats as Stat[])
			: [
					METRIC.FAMILIES_SUPPORTED,
					METRIC.STUDENTS_SPONSORED,
					METRIC.ELDERS_CARED_FOR,
					METRIC.FUNDS_RAISED
				].map((metric) => ({ metric, label: METRIC_LABELS[metric as MetricKey] }));

		return stats.flatMap((stat) => {
			const key = String(stat.metric ?? '');
			const label = stat.label || METRIC_LABELS[key as MetricKey] || key;

			if (isMoneyMetric(key)) {
				// One line per currency: birr and dollars are never added together.
				const lines = (data.moneyTotals?.[key] ?? [])
					.filter((total) => total.amount > 0)
					.map((total) => compactMoney(total.amount, total.currency));
				return lines.length ? [{ key, label, lines }] : [];
			}

			const value = data.metrics?.[key] ?? 0;
			if (value <= 0) return [];
			return [{ key, label, lines: [`${compactCount(value)}${stat.suffix ?? ''}`] }];
		});
	});

	/** `228000000` santim → `ETB 2.3M`: a corner of a photograph is not a ledger. */
	function compactMoney(minor: number, currency: string) {
		try {
			return new Intl.NumberFormat('en', {
				style: 'currency',
				currency: currency.toUpperCase(),
				notation: 'compact',
				maximumFractionDigits: 1
			}).format(toMajor(minor, currency));
		} catch {
			return `${currency.toUpperCase()} ${compactCount(toMajor(minor, currency))}`;
		}
	}

	const compactCount = (value: number) =>
		new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
</script>

{#snippet tagline()}
	<ul
		class="flex flex-col gap-2 border-l-2 border-(--gold) py-2 pl-6"
		aria-label={s('site.tagline')}
	>
		{#each taglineWords as word (word)}
			<li class="font-serif text-[clamp(1.8rem,1rem+2.2vw,3.25rem)] leading-tight font-bold">
				{word}.
			</li>
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
		<!-- The photographs are the ground: full-bleed, crossfading, under a
		     forest shade that is deepest behind the words on the left and along
		     the foot where the figures sit, and lifts toward the top right so the
		     people in the pictures are still seen. On a desktop it fills the window
		     below the header. -->
		<section
			class="on-forest relative isolate flex min-h-[78svh] flex-col overflow-hidden bg-(--night) md:min-h-[calc(100svh-6rem)]"
		>
			<HeroSlideshow
				images={data.heroGallery}
				fallbackImage={s('hero.image')}
				sizes="100vw"
				class="absolute inset-0 -z-20"
				dotsClass="wrap absolute inset-x-0 top-5 z-10 justify-end md:top-7"
			/>
			<div class="hero-shade pointer-events-none absolute inset-0 -z-10" aria-hidden="true"></div>

			<div
				class="wrap flex flex-1 flex-col justify-end gap-12 pt-24 pb-10 md:pt-28 md:pb-16 lg:flex-row lg:items-end lg:justify-between lg:gap-16"
			>
				<div class="flex max-w-[52rem] flex-col gap-6 md:gap-7">
					<h1
						use:reveal={{ orchestrate: true }}
						class="text-[clamp(2.6rem,1.3rem+4.4vw,6.25rem)] text-[#f6f3e6]"
					>
						{s('hero.headline') || 'Nobody should face the hardest days alone.'}
					</h1>

					{#if s('hero.subheadline')}
						<p
							use:reveal={{ orchestrate: true, delay: 100 }}
							class="max-w-[42ch] text-[clamp(1.15rem,0.9rem+0.7vw,1.6rem)] leading-relaxed text-(--honey)"
						>
							{s('hero.subheadline')}
						</p>
					{/if}

					<div
						use:reveal={{ orchestrate: true, delay: 180 }}
						class="flex flex-wrap items-center gap-x-9 gap-y-4 pt-2"
					>
						<a
							href="/donate"
							class={cn(
								buttonVariants({ size: 'lg' }),
								'btn-gold h-14 px-9 text-[1.15rem] md:h-15 md:px-10 md:text-[1.25rem]'
							)}
						>
							Give to the Foundation
						</a>
						<a
							href="/programs"
							class="link-quiet text-[clamp(1.1rem,0.9rem+0.5vw,1.4rem)] font-medium text-[#f6f3e6]"
						>
							See our programmes
						</a>
					</div>
				</div>

				<!-- What has been done so far, in the bottom right corner: gold figures
				     over a gold hairline, the way a caption sits in the corner of a
				     photograph. -->
				{#if accomplishments.length}
					<dl
						class="grid shrink-0 grid-cols-2 items-end gap-x-8 gap-y-6 border-t border-(--gold)/40 pt-6 lg:gap-x-[clamp(2.5rem,3.5vw,4.5rem)] lg:gap-y-8 lg:border-t-0 lg:pt-0"
					>
						{#each accomplishments as item (item.key)}
							<div class="flex flex-col gap-1 lg:text-right">
								<dt class="order-2 text-[clamp(0.95rem,0.85rem+0.3vw,1.15rem)] text-(--honey)/90">
									{item.label}
								</dt>
								{#each item.lines as line (line)}
									<dd
										class="order-1 font-serif text-[clamp(2rem,1.2rem+2.2vw,3.5rem)] leading-none font-bold text-(--gold) lining-nums"
									>
										{line}
									</dd>
								{/each}
							</div>
						{/each}
					</dl>
				{/if}
			</div>
		</section>
	{/snippet}

	{#if data.gallery.length}
		<section class="mt-24 md:mt-40">
			<h2 class="mb-10 text-[clamp(2.1rem,1.2rem+2.6vw,4rem)]">Moments from the work</h2>
			<Gallery images={data.gallery} />
		</section>
	{/if}
</PageShell>
