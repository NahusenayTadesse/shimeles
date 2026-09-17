<script lang="ts">
	import PageShell from '$lib/content/PageShell.svelte';
	import HeroSlideshow from '$lib/components/hero-slideshow.svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import LinkCue from '$lib/components/link-cue.svelte';
	import { ArrowDown } from '@lucide/svelte';
	import { reveal } from '$lib/actions/reveal';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { isMoneyMetric, METRIC, METRIC_LABELS, type MetricKey } from '$lib/metrics';
	import { toMajor } from '$lib/money';
	import { countUp } from '$lib/actions/count-up';
	import { cn } from '$lib/utils';
	import {
		FolderOpen,
		GraduationCap,
		HandCoins,
		HandHeart,
		HeartHandshake,
		Sparkles,
		Users
	} from '@lucide/svelte';

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

			const icon = metricIcons[key] ?? Sparkles;

			if (isMoneyMetric(key)) {
				// One line per currency: birr and dollars are never added together.
				const lines = (data.moneyTotals?.[key] ?? [])
					.filter((total) => total.amount > 0)
					.map((total) => ({
						id: total.currency,
						value: toMajor(total.amount, total.currency),
						format: (n: number) => compactMoney(n, total.currency)
					}));
				return lines.length ? [{ key, label, icon, money: true, lines }] : [];
			}

			const value = data.metrics?.[key] ?? 0;
			if (value <= 0) return [];
			const suffix = stat.suffix ?? '';
			return [
				{
					key,
					label,
					icon,
					money: false,
					lines: [{ id: key, value, format: (n: number) => `${compactCount(n)}${suffix}` }]
				}
			];
		});
	});

	/** A picture beside each figure, by metric; anything new gets a spark. */
	const metricIcons: Record<string, typeof Users> = {
		[METRIC.FAMILIES_SUPPORTED]: Users,
		[METRIC.STUDENTS_SPONSORED]: GraduationCap,
		[METRIC.ELDERS_CARED_FOR]: HandHeart,
		[METRIC.FUNDS_RAISED]: HandCoins,
		[METRIC.VOLUNTEERS_ACTIVE]: HeartHandshake,
		[METRIC.CASES_OPEN]: FolderOpen
	};

	/** `228000` birr → `ETB 228K`: a corner of a photograph is not a ledger. */
	function compactMoney(major: number, currency: string) {
		try {
			return new Intl.NumberFormat('en', {
				style: 'currency',
				currency: currency.toUpperCase(),
				notation: 'compact',
				maximumFractionDigits: 1
			}).format(major);
		} catch {
			return `${currency.toUpperCase()} ${compactCount(major)}`;
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
			<!-- The sun: warm light breaking over the top of the photographs. -->
			<div
				class="hero-sunlight pointer-events-none absolute inset-0 -z-10"
				aria-hidden="true"
			></div>

			<div
				class="wrap flex flex-1 flex-col justify-end gap-12 pt-24 pb-20 md:pt-28 md:pb-20 lg:flex-row lg:items-end lg:justify-between lg:gap-16"
			>
				<div class="flex max-w-[52rem] flex-col gap-6 md:gap-7">
					<h1
						use:reveal={{ orchestrate: true }}
						class="text-[clamp(2.6rem,1.3rem+4.4vw,6.25rem)] text-[#fdf0cc]"
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
							<LinkCue kind="give" />
							Give to the Foundation
						</a>
						<a
							href="/programs"
							class="link-quiet text-[clamp(1.1rem,0.9rem+0.5vw,1.4rem)] font-medium text-[#f6f3e6]"
						>
							See our programmes
							<LinkCue />
						</a>
					</div>
				</div>

				<!-- What has been done so far, as its own object in the bottom right: a
				     pane of clear, frosted glass the photograph shows through, lit along
				     its top edge, with a gold rim and a gold glow, one tile per figure. The tiles spring up one after another once the headline has
				     landed, and the figures count up to their value. -->
				{#if accomplishments.length}
					<dl
						class="impact-panel grid shrink-0 grid-cols-1 overflow-hidden rounded-[1.75rem] sm:grid-cols-2 lg:min-w-[28rem]"
					>
						{#each accomplishments as item, index (item.key)}
							{@const Icon = item.icon}
							<div
								class="impact-tile flex items-center gap-4 px-5 py-5 md:px-6 md:py-6 sm:[&:last-child:nth-child(odd)]:col-span-2"
								style:--i={index}
							>
								<span
									class="impact-icon grid size-12 shrink-0 place-items-center rounded-full md:size-14"
									aria-hidden="true"
								>
									<Icon class="size-6 md:size-7" />
								</span>
								<div class="flex min-w-0 flex-col">
									<dt class="order-2 text-[clamp(0.95rem,0.85rem+0.25vw,1.1rem)] text-(--honey)">
										{item.label}
									</dt>
									{#each item.lines as line (line.id)}
										<dd
											use:countUp={{ value: line.value, format: line.format, duration: 1600 }}
											class={cn(
												'order-1 font-serif leading-[1.05] font-bold text-(--gold-bright) lining-nums',
												item.money && item.lines.length > 1
													? 'text-[clamp(1.5rem,1rem+1.2vw,2.2rem)]'
													: 'text-[clamp(2.1rem,1.3rem+2vw,3.4rem)]'
											)}
										>
											{line.format(line.value)}
										</dd>
									{/each}
								</div>
							</div>
						{/each}
					</dl>
				{/if}
			</div>

			<!-- The page does not end here. On a desktop the hero fills the window,
			     so without this a visitor can reasonably take it for the whole page.
			     A plain link to the content below: it works with JavaScript off, and
			     the page's smooth scrolling carries it the rest of the way. -->
			<a
				href="#after-hero"
				class="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full"
				aria-label={data.strings?.['nav.scroll_down'] ?? 'See more below'}
			>
				<span
					class="hero-scroll-cue grid size-11 place-items-center rounded-full border border-(--gold)/60 bg-(--night)/30 text-(--gold-bright) backdrop-blur-sm transition-colors hover:bg-(--night)/55 md:size-12"
				>
					<ArrowDown class="size-5" aria-hidden="true" />
				</span>
			</a>
		</section>
		<div id="after-hero" class="scroll-mt-28"></div>
	{/snippet}

	{#if data.gallery.length}
		<section class="mt-24 md:mt-40">
			<h2 class="mb-10 text-[clamp(2.1rem,1.2rem+2.6vw,4rem)]">Moments from the work</h2>
			<Gallery images={data.gallery} />
		</section>
	{/if}
</PageShell>
