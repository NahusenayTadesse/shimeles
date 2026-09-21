<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import { countUp } from '$lib/actions/count-up';
	import { assetUrl, imageSrcset } from '$lib/assets';
	import { formatCompact, formatMoney, type MoneyTotal } from '$lib/money';
	import { isMoneyMetric } from '$lib/metrics';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import LinkCue from '$lib/components/link-cue.svelte';
	import DynamicForm from '$lib/forms/DynamicForm.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Copy } from '@lucide/svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import PaymentNotice from '$lib/components/payment-notice.svelte';
	import VideoCarousel from '$lib/content/VideoCarousel.svelte';
	import TestimonialSlider from '$lib/content/TestimonialSlider.svelte';
	import { toast } from 'svelte-sonner';
	import { cn } from '$lib/utils';
	import type {
		RenderBlock,
		RenderInitiative,
		RenderPillar,
		RenderTestimonial
	} from '$lib/content/types';
	import type { RenderForm } from '$lib/forms/types';
	import ChartCanvas from '$lib/components/chart.svelte';
	import type { ChartSeries } from '$lib/charts/types';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { Snippet } from 'svelte';

	/**
	 * The generic block renderer.
	 *
	 * §6: every public page renders its `content_blocks` in `sort_order` through
	 * this component, and no page template contains prose. Each block type has a
	 * documented `content` JSON contract — the shapes below are the contract, and
	 * the dashboard's block editor writes against them.
	 *
	 * Anything a block needs that lives elsewhere (the pillar list, the impact
	 * counters, the bank details) is passed in rather than fetched here, so this
	 * stays a pure renderer and the page's `load` stays the single place that
	 * touches the database.
	 */
	let {
		blocks,
		pillars = [],
		initiatives = [],
		charts = {},
		metrics = {},
		moneyTotals = {},
		payments = [],
		forms = {},
		testimonials = [],
		labels = {},
		initiativeNotice = '',
		paymentNotice = { en: '', am: '' },
		ledeAside,
		class: className = ''
	}: {
		blocks: RenderBlock[];
		pillars?: RenderPillar[];
		initiatives?: RenderInitiative[];
		/** Named chart series, keyed by the name an `impact_chart` block asks for. */
		charts?: Record<string, ChartSeries>;
		/** Count metrics only. Money arrives per currency in `moneyTotals`. */
		metrics?: Record<string, number>;
		/** Money metric key → one total per currency, in that currency's minor units. */
		moneyTotals?: Record<string, MoneyTotal[]>;
		payments?: {
			accountId: number;
			accountName: string;
			accountNumber: string;
			bankName: string | null;
			branch: string | null;
			swiftCode: string | null;
			currency: string;
			methodName: string;
			methodKind: string;
			instructions: string | null;
		}[];
		/** `form_embed` blocks render inline using these — see `hydrateBlocks`. */
		forms?: Record<
			string,
			{ definition: RenderForm; data: SuperValidated<Record<string, unknown>> }
		>;
		/** `testimonial_slider` blocks render these. */
		testimonials?: RenderTestimonial[];
		labels?: Record<string, string>;
		/**
		 * The `initiatives.disclaimer` setting, rendered under an
		 * `initiative_grid`. Passed in rather than read here for the same reason
		 * as everything else on this component — see the note above — and empty
		 * when staff have cleared it, in which case nothing renders.
		 */
		initiativeNotice?: string;
		/**
		 * The bank wording of "no money moves on this website", from
		 * `donation.notice_bank`, rendered under a `donation_details` block.
		 * Passed in for the same reason as everything else here.
		 */
		paymentNotice?: { en: string; am: string };
		/**
		 * Drawn beside a page's opening paragraph, which otherwise leaves half
		 * the width empty. A snippet from the route rather than block content,
		 * because what belongs there is the page's own — the homepage puts the
		 * Foundation's tagline in it — and every other page keeps its lede alone.
		 */
		ledeAside?: Snippet;
		class?: string;
	} = $props();

	/** Reads a string out of a block's untyped JSON without littering casts. */
	const str = (block: RenderBlock, key: string): string =>
		typeof block.content[key] === 'string' ? (block.content[key] as string) : '';

	const list = <T,>(block: RenderBlock, key: string): T[] =>
		Array.isArray(block.content[key]) ? (block.content[key] as T[]) : [];

	const copy = async (value: string) => {
		await navigator.clipboard.writeText(value);
		toast.success('Copied');
	};

	/**
	 * The first rich-text block on a page reads as its opening paragraph, and
	 * gets the drop cap.
	 *
	 * Unless it says otherwise: `{ lede: false }` opts out. A drop cap is a
	 * flourish for prose that opens a page, and it is actively wrong on a
	 * document that opens with a label — on the privacy policy it turned
	 * "Website:" into a giant W sitting apart from "ebsite:".
	 */
	/**
	 * Blocks drawn as edge-to-edge bands. Their heading goes inside the band,
	 * on its colour, rather than hanging above it on the paper — a heading
	 * outside a full-width band reads as a label for the gap.
	 */
	const bands = new Set(['stat_counter', 'cta_button', 'memoriam']);

	const isLede = (block: RenderBlock, index: number) =>
		block.type === 'rich_text' && index === 0 && block.content.lede !== false;
</script>

{#snippet heading(block: RenderBlock, className = '')}
	{#if block.heading}
		<h2 class={cn('mb-12 max-w-3xl text-[clamp(2.1rem,1.2rem+2.6vw,4rem)]', className)}>
			{block.heading}
		</h2>
	{/if}
{/snippet}

<div class={cn('flex flex-col gap-24 md:gap-40', className)}>
	{#each blocks as block, index (block.id)}
		<section id={block.type === 'memoriam' ? 'in-memoriam' : undefined}>
			{#if !bands.has(block.type)}
				{@render heading(block)}
			{/if}

			{#if block.type === 'rich_text'}
				<!-- `{ body }` — HTML authored in the dashboard editor. -->
				{#if isLede(block, index) && ledeAside}
					<div class="grid items-center gap-10 md:grid-cols-[minmax(0,1.5fr)_1fr] lg:gap-24">
						<div class="prose-block prose-lede max-w-[48ch]">
							{@html str(block, 'body')}
						</div>
						{@render ledeAside()}
					</div>
				{:else}
					<div class={cn('prose-block max-w-prose', isLede(block, index) && 'prose-lede')}>
						{@html str(block, 'body')}
					</div>
				{/if}
			{:else if block.type === 'image'}
				<!-- `{ src, alt, caption }` -->
				<!-- A split spread, edge to edge: the photograph fills one half of the
     window and the sentence has the other half to itself, on paper rather
     than through a dark gradient over the picture. -->
				<figure class="bleed sun-soft grid md:min-h-[80svh] md:grid-cols-2">
					<img
						src={assetUrl(str(block, 'src'))}
						srcset={imageSrcset(str(block, 'src'))}
						sizes="(min-width: 768px) 50vw, 100vw"
						alt={str(block, 'alt')}
						loading="lazy"
						class="aspect-[4/3] size-full object-cover md:aspect-auto"
					/>
					{#if str(block, 'caption')}
						<figcaption
							class="flex items-center px-[clamp(1.5rem,5vw,7rem)] py-14 font-serif text-[clamp(1.8rem,1rem+2.2vw,3.4rem)] leading-[1.15] font-bold text-balance"
						>
							{str(block, 'caption')}
						</figcaption>
					{/if}
				</figure>
			{:else if block.type === 'stat_counter'}
				<!-- `{ stats: [{ metric, label, suffix }] }`. `metric` names a key in
				     `impact_metrics_cache`; the value comes from there, or from an
				     `impact.override_*` setting. Whether a counter is money is a
				     property of the metric, not of the block. -->
				<div class="on-sun sun-surface bleed py-16 md:py-28">
					{@render heading(block, 'wrap max-w-none text-(--forest)')}
					<div class="wrap grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
						{#each list<Record<string, unknown>>(block, 'stats') as stat, statIndex (statIndex)}
							{@const key = String(stat.metric ?? '')}
							<!-- Derived from the metric, never read from the block. A stat block
							     saved without `is_money` used to render funds raised — stored in
							     santim — through the plain compact formatter, so 1234567 published
							     as "1.2M" rather than "ETB 12,345.67". -->
							{@const money = isMoneyMetric(key)}
							<!-- A money counter is a list, one line per currency, because the
							     Foundation banks birr and dollars and neither total is a share
							     of the other. A single figure here was santim added to cents.
							     `moneyTotals` is empty until the cache is first warmed, so a
							     cold homepage still shows a zero rather than a blank panel. -->
							{@const totals = money ? (moneyTotals[key] ?? [{ currency: 'ETB', amount: 0 }]) : []}
							<div class="flex flex-col gap-3 border-t border-(--forest)/25 pt-6">
								{#if money}
									<div
										class="font-serif text-[clamp(1.5rem,1rem+1.2vw,2.2rem)] leading-tight font-bold text-(--forest) tabular-nums"
									>
										{#each totals as total (total.currency)}
											<p
												use:countUp={{
													value: total.amount,
													format: (n) => formatMoney(n, total.currency)
												}}
											>
												{formatMoney(total.amount, total.currency)}
											</p>
										{/each}
									</div>
								{:else}
									{@const value = metrics[key] ?? 0}
									<p
										use:countUp={{
											value,
											format: (n) => `${formatCompact(n)}${stat.suffix ?? ''}`
										}}
										class="font-serif text-[clamp(3rem,1.8rem+3.8vw,5.75rem)] leading-none font-bold text-(--forest) tabular-nums"
									>
										{`${formatCompact(value)}${stat.suffix ?? ''}`}
									</p>
								{/if}
								<p class="text-[clamp(1.1rem,0.9rem+0.5vw,1.45rem)]">
									{stat.label ?? key}
								</p>
							</div>
						{/each}
					</div>
				</div>
			{:else if block.type === 'impact_chart'}
				<!--
					`{ series, heading, caption }`. `series` names one of the allow-listed
					public charts; the data is fetched in `pageData.ts` only for the keys
					a page actually asks for.

					One shape, chosen by the data, and no picker. The dashboard offers a
					switcher because staff are interrogating figures they already know; a
					donor is being told something, and four ways to redraw the same ring
					is a question they did not ask.
				-->
				{@const series = charts[String(block.content.series ?? '')]}
				{#if series}
					<!--
						No heading of its own: every block already renders the one a staff
						member typed into "heading above the block", and a second one drew
						the same words twice.
					-->
					<div use:reveal class="max-w-5xl">
						{#if block.content.caption}
							<p class="text-muted-foreground">{block.content.caption}</p>
						{/if}
						<div class="mt-6">
							<ChartCanvas {series} kind={series.kinds[0]} height={460} />
						</div>
					</div>
				{/if}
			{:else if block.type === 'quote'}
				<!-- `{ text, attribution }` -->
				<blockquote class="max-w-3xl border-l-2 border-(--gold) pl-6 md:pl-8">
					<p class="font-serif text-2xl leading-snug md:text-3xl">{str(block, 'text')}</p>
					{#if str(block, 'attribution')}
						<footer class="mt-4 font-sans text-base text-muted-foreground">
							{str(block, 'attribution')}
						</footer>
					{/if}
				</blockquote>
			{:else if block.type === 'cta_button'}
				<!-- `{ label, url, variant, note }` -->
				<!-- The one forest band in the middle of a page: the sentence, and the gold button. -->
				<div class="on-forest forest-glow bleed py-20 text-[#fcefc9] md:py-32">
					{@render heading(block, 'wrap max-w-none')}
					<div
						class="wrap flex flex-col items-start gap-10 md:flex-row md:items-center md:justify-between"
					>
						<p
							class="max-w-[22ch] font-serif text-[clamp(2.1rem,1rem+3.2vw,4.5rem)] leading-[1.05] font-bold"
						>
							{str(block, 'note') || 'Every gift reaches a family this month, not a fund.'}
						</p>
						<a
							href={str(block, 'url') || '#'}
							class={cn(
								buttonVariants({ size: 'lg' }),
								'btn-gold h-16 shrink-0 px-11 text-[1.3rem]'
							)}
						>
							<LinkCue kind={str(block, 'url').startsWith('/donate') ? 'give' : 'next'} />
							{str(block, 'label') || 'Learn more'}
						</a>
					</div>
				</div>
			{:else if block.type === 'pillar_grid'}
				<!-- `{ show_apply_links }` — the pillars themselves come from the
				     `pillars` table, never from this block's JSON. -->
				<!-- No card around each programme: a photograph, its name and a line
     about it, the way a printed report would set them. -->
				<div class="grid gap-x-[clamp(1.5rem,2.5vw,3.5rem)] gap-y-16 md:grid-cols-2 xl:grid-cols-4">
					{#each pillars as pillar (pillar.id)}
						<article class="flex flex-col gap-4">
							{#if pillar.image}
								<!-- The photograph opens the programme too. Out of the tab order and
								     hidden from screen readers, because the name just below is the
								     same link: one programme, one stop, not two identical anchors. -->
								<a
									href={`/programs/${pillar.slug}`}
									tabindex="-1"
									aria-hidden="true"
									class="group block overflow-hidden rounded-[1.25rem]"
								>
									<img
										src={assetUrl(pillar.image)}
										srcset={imageSrcset(pillar.image)}
										sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
										alt=""
										loading="lazy"
										class="aspect-[4/5] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
									/>
								</a>
							{/if}
							<h3 class="mt-2 text-[clamp(1.6rem,1.1rem+1vw,2.2rem)]">
								<a href={`/programs/${pillar.slug}`} class="link-title">{pillar.name}</a>
							</h3>
							{#if pillar.summary}
								<p class="max-w-prose text-muted-foreground">{pillar.summary}</p>
							{/if}
							<div class="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
								<!-- The programme's name is in the link, not only in an
										     `aria-label`: four cards side by side each saying "Learn
										     more" are four identical anchors to four different pages,
										     which is the least useful anchor text on the site for a
										     screen reader's link list and for a crawler alike. It is
										     `sr-only` rather than visible because the card directly
										     above it is already headed with the name, and repeating it
										     in the button would read as clutter to someone who can see
										     both. -->
								<a href={`/programs/${pillar.slug}`} class="link-quiet font-medium">
									Learn more<span class="sr-only"> about {pillar.name}</span>
									<LinkCue />
								</a>
								{#if block.content.show_apply_links !== false && pillar.hasPublicApplication}
									<a href={`/programs/${pillar.slug}#apply`} class="link-quiet font-medium">
										Apply for support<span class="sr-only"> from {pillar.name}</span>
										<LinkCue />
									</a>
								{/if}
							</div>
						</article>
					{/each}
				</div>
			{:else if block.type === 'values_list'}
				<!-- `{ values: [{ icon, title, body }] }` -->
				<div class="grid gap-12 md:grid-cols-3 md:gap-[clamp(2rem,4vw,6rem)]">
					{#each list<Record<string, unknown>>(block, 'values') as value, valueIndex (valueIndex)}
						<div class="flex flex-col gap-3">
							<DynamicIcon
								name={String(value.icon ?? '')}
								class="size-10 text-(--gold-deep) md:size-14 [&_*]:[stroke-width:1.25]"
							/>
							<h3 class="text-[clamp(1.7rem,1.1rem+1.2vw,2.5rem)]">
								{value.title}
							</h3>
							<p class="text-muted-foreground">
								{value.body}
							</p>
						</div>
					{/each}
				</div>
			{:else if block.type === 'initiative_grid'}
				<!-- Rows come from `future_initiatives`; the block carries no copy. -->
				<div class="grid gap-6 md:grid-cols-3">
					{#each initiatives as initiative (initiative.id)}
						<div class="flex">
							<Card.Root class="flex w-full flex-col gap-3 overflow-hidden p-0">
								{#if initiative.image}
									<img
										src={assetUrl(initiative.image)}
										srcset={imageSrcset(initiative.image)}
										sizes="(min-width: 768px) 33vw, 100vw"
										alt={initiative.name}
										loading="lazy"
										class="aspect-video w-full object-cover"
									/>
								{/if}
								<div class="flex flex-1 flex-col gap-3 p-7">
									<div class="flex items-start justify-between gap-2">
										<div class="w-fit rounded-2xl bg-muted p-3 text-primary">
											<DynamicIcon name={initiative.icon} class="size-6" />
										</div>
										<Badge variant="secondary" class="capitalize">
											{initiative.status.replace('_', ' ')}
										</Badge>
									</div>
									<h3 class="font-heading text-lg font-semibold">{initiative.name}</h3>
									{#if initiative.description}
										<p class="text-sm text-muted-foreground">{initiative.description}</p>
									{/if}
									{#if initiative.goalAmount}
										<p class="mt-auto pt-2 text-sm font-medium">
											Goal: {formatMoney(initiative.goalAmount, initiative.currency)}
										</p>
									{/if}
								</div>
							</Card.Root>
						</div>
					{/each}
				</div>
				{#if initiativeNotice.trim()}
					<!-- A legal notice, so it sits with the grid it qualifies rather
					     than at the foot of the page where nobody reads it. -->
					<div
						class="mt-6 rounded-2xl border border-warning/30 bg-warning/8 p-5 text-sm text-muted-foreground"
					>
						<p class="mb-1 font-medium text-foreground">Please take notice</p>
						<p class="whitespace-pre-wrap">{initiativeNotice}</p>
					</div>
				{/if}
			{:else if block.type === 'form_embed'}
				<!-- `{ slug, label }` — the form itself renders right here (data
				     comes from `hydrateBlocks`' `loadEmbeddedForms`), so applying
				     doesn't mean leaving the page. `/forms/[slug]` still exists as
				     a standalone, shareable link to the same form. -->
				{@const slug = str(block, 'slug')}
				{@const embed = forms[slug]}
				<div class="mx-auto flex w-full max-w-2xl flex-col gap-6">
					{#if str(block, 'label')}
						<p class="text-lg text-muted-foreground">{str(block, 'label')}</p>
					{/if}
					{#if embed}
						<div class="shadow-warm rounded-[2rem] border bg-card p-6 md:p-10">
							<DynamicForm
								form={embed.definition}
								data={embed.data}
								action={`?/submit&slug=${slug}`}
								{labels}
							/>
						</div>
					{:else}
						<div
							class="flex flex-col items-start gap-4 rounded-[2rem] border-2 border-dashed border-olive/30 bg-card p-8 sm:flex-row sm:items-center sm:justify-between"
						>
							<a href={`/forms/${slug}`} class={cn(buttonVariants({ size: 'lg' }), 'shrink-0')}>
								Open the form
							</a>
						</div>
					{/if}
				</div>
			{:else if block.type === 'donation_details'}
				<!-- Bank and wallet details, straight from `payment_accounts`. The
				     account number is the one thing a donor must copy exactly, so it
				     is a copy button rather than text to be retyped. -->
				<div class="grid gap-5 md:grid-cols-2">
					{#each payments as account (account.accountId)}
						<Card.Root class="flex flex-col gap-0 border-t-2 border-t-(--gold) p-0">
							<div class="flex flex-col gap-3 p-6">
								<div class="flex items-center justify-between gap-2">
									<h3 class="font-heading text-lg font-semibold">{account.methodName}</h3>
									<Badge variant="outline">{account.currency}</Badge>
								</div>
								<dl class="grid gap-2 text-sm">
									<div class="flex justify-between gap-4">
										<dt class="text-muted-foreground">Account name</dt>
										<dd class="text-right font-medium">{account.accountName}</dd>
									</div>
									<div class="flex items-center justify-between gap-4">
										<dt class="text-muted-foreground">Account number</dt>
										<dd class="flex items-center gap-2 text-right font-mono font-medium">
											{account.accountNumber}
											<Button
												variant="ghost"
												size="icon"
												class="size-7 rounded-full"
												onclick={() => copy(account.accountNumber)}
											>
												<Copy class="size-3.5" />
											</Button>
										</dd>
									</div>
									{#if account.bankName}
										<div class="flex justify-between gap-4">
											<dt class="text-muted-foreground">Bank</dt>
											<dd class="text-right">{account.bankName}</dd>
										</div>
									{/if}
									{#if account.swiftCode}
										<div class="flex justify-between gap-4">
											<dt class="text-muted-foreground">SWIFT</dt>
											<dd class="text-right font-mono">{account.swiftCode}</dd>
										</div>
									{/if}
								</dl>
								{#if account.instructions}
									<p class="text-sm text-muted-foreground">{account.instructions}</p>
								{/if}
							</div>
						</Card.Root>
					{/each}
				</div>
				<!-- Under the account numbers, not above them: it answers the
				     question the numbers raise. -->
				<PaymentNotice en={paymentNotice.en} am={paymentNotice.am} class="mt-5" />
			{:else if block.type === 'gallery'}
				<!-- Photographs live in `media_items` keyed by this block, not in
				     `content` — they are managed on the shared media screen. -->
				<Gallery images={block.media?.gallery ?? []} />
			{:else if block.type === 'video'}
				<!-- One clip renders as one clip; several become a carousel rather
				     than a long column the reader has to scroll past. -->
				<div class="mx-auto w-full max-w-4xl">
					<VideoCarousel videos={block.media?.videos ?? []} title={block.heading ?? 'Video'} />
				</div>
			{:else if block.type === 'testimonial_slider'}
				<!-- `{ show_all_href }` — the quotes come from `testimonials` where
				     `is_featured`, passed in by the page's `load`. -->
				<TestimonialSlider
					{testimonials}
					showAllHref={str(block, 'show_all_href') || '/testimonials'}
				/>
			{:else if block.type === 'memoriam'}
				<!-- `{ name, photo, body, linkHref, linkLabel }` — a tribute, set apart
				     from the surrounding prose rather than folded into it. -->
				<!-- Set like a letter: centred, in the serif, on a slightly deeper paper,
     with his portrait in its frame. A tribute to a life, not a notice of a
     death, so there is no black here. -->
				<div class="bleed sun-soft py-20 md:py-32">
					{@render heading(block, 'wrap max-w-none')}
					<div
						class="wrap grid items-center gap-12 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-[clamp(3rem,7vw,10rem)]"
					>
						{#if str(block, 'photo')}
							<div
								class="photo-frame-portrait mx-auto w-[min(70%,22rem)] ring-1 ring-(--gold) ring-offset-8 ring-offset-(--accent) md:w-full md:max-w-[34rem]"
							>
								<img
									src={assetUrl(str(block, 'photo'))}
									srcset={imageSrcset(str(block, 'photo'))}
									sizes="(min-width: 768px) 34rem, 70vw"
									alt={str(block, 'name')}
									loading="lazy"
									class="size-full object-cover"
								/>
							</div>
						{/if}
						<div class="flex flex-col items-start gap-7">
							{#if str(block, 'name')}
								<h3 class="text-[clamp(2.2rem,1.1rem+2.8vw,3.75rem)]">
									{str(block, 'name')}
								</h3>
							{/if}
							<div
								class="prose-block max-w-[46ch] font-serif text-[clamp(1.2rem,0.9rem+0.8vw,1.7rem)] leading-relaxed text-foreground/85 [&_p]:font-serif"
							>
								{@html str(block, 'body')}
							</div>
							{#if str(block, 'linkHref')}
								<a
									href={str(block, 'linkHref')}
									class={cn(buttonVariants({ size: 'lg' }), 'mt-2 h-14 px-9 text-[1.15rem]')}
								>
									{str(block, 'linkLabel') || 'Read more'}
									<LinkCue />
								</a>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</section>
	{/each}
</div>
