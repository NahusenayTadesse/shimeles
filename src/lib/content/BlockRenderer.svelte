<script lang="ts">
	import { reveal, stagger } from '$lib/actions/reveal';
	import { countUp } from '$lib/actions/count-up';
	import { assetUrl } from '$lib/assets';
	import { formatCompact, formatMoney } from '$lib/money';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import TrimBand from '$lib/components/trim-band.svelte';
	import DynamicForm from '$lib/forms/DynamicForm.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { ArrowRight, Copy, Quote } from '@lucide/svelte';
	import Gallery from '$lib/components/Gallery.svelte';
	import VideoEmbed from '$lib/content/VideoEmbed.svelte';
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
	import type { SuperValidated } from 'sveltekit-superforms';

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
		metrics = {},
		payments = [],
		forms = {},
		testimonials = [],
		labels = {},
		class: className = ''
	}: {
		blocks: RenderBlock[];
		pillars?: RenderPillar[];
		initiatives?: RenderInitiative[];
		metrics?: Record<string, number>;
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
		class?: string;
	} = $props();

	/** Reads a string out of a block's untyped JSON without littering casts. */
	const str = (block: RenderBlock, key: string): string =>
		typeof block.content[key] === 'string' ? (block.content[key] as string) : '';

	const list = <T,>(block: RenderBlock, key: string): T[] =>
		Array.isArray(block.content[key]) ? (block.content[key] as T[]) : [];

	/** Accent token → the Tailwind classes the pillar cards use. */
	const accent = (color: string) =>
		({
			clay: 'text-clay border-clay/30 bg-clay/8',
			olive: 'text-olive-bright border-olive/40 bg-olive/10',
			plum: 'text-plum border-plum/30 bg-plum/8',
			sky: 'text-sky border-sky/30 bg-sky/8'
		})[color] ?? 'text-primary border-primary/30 bg-primary/8';

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
	const isLede = (block: RenderBlock, index: number) =>
		block.type === 'rich_text' && index === 0 && block.content.lede !== false;
</script>

<div class={cn('flex flex-col gap-20 md:gap-28', className)}>
	{#each blocks as block, index (block.id)}
		<section
			id={block.type === 'memoriam' ? 'in-memoriam' : undefined}
			use:reveal={{ delay: stagger(index, 60, 3) }}
		>
			{#if block.heading}
				<div class="mb-8 flex flex-col gap-2">
					<h2 class="text-3xl md:text-4xl">{block.heading}</h2>
					<span class="h-[3px] w-14 rounded-full bg-olive"></span>
				</div>
			{/if}

			{#if block.type === 'rich_text'}
				<!-- `{ body }` — HTML authored in the dashboard editor. -->
				<div class={cn('prose-block max-w-prose', isLede(block, index) && 'prose-lede')}>
					{@html str(block, 'body')}
				</div>
			{:else if block.type === 'image'}
				<!-- `{ src, alt, caption }` -->
				<figure class="shadow-warm relative mx-auto flex max-w-5xl overflow-hidden rounded-[2rem]">
					<img
						src={assetUrl(str(block, 'src'))}
						alt={str(block, 'alt')}
						loading="lazy"
						class="h-[22rem] w-full object-cover md:h-[28rem]"
					/>
					{#if str(block, 'caption')}
						<div
							class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent"
							aria-hidden="true"
						></div>
						<figcaption class="absolute inset-x-0 bottom-0 flex items-end gap-4 p-8 md:p-12">
							<Quote class="size-9 shrink-0 text-olive-bright/90 md:size-11" fill="currentColor" />
							<p
								class="font-heading text-xl leading-snug text-white italic drop-shadow-sm md:text-2xl"
							>
								{str(block, 'caption')}
							</p>
						</figcaption>
					{/if}
				</figure>
			{:else if block.type === 'stat_counter'}
				<!-- `{ stats: [{ metric, label, suffix, is_money }] }`
				     `metric` names a key in `impact_metrics_cache`; the value comes
				     from there, or from an `impact.override_*` setting. -->
				<div class="shadow-warm relative overflow-hidden rounded-[2rem] bg-clay-deep">
					<div
						class="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-olive/10 blur-3xl"
						aria-hidden="true"
					></div>
					<div
						class="relative grid divide-y divide-olive/15 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4"
					>
						{#each list<Record<string, unknown>>(block, 'stats') as stat, statIndex (statIndex)}
							{@const key = String(stat.metric ?? '')}
							{@const value = metrics[key] ?? 0}
							<div
								use:reveal={{ delay: stagger(statIndex, 80, 4), scale: 0.92 }}
								class="group flex flex-col items-center gap-1.5 px-6 py-10 text-center"
							>
								<p
									use:countUp={{
										value,
										format: stat.is_money
											? (n) => formatMoney(n)
											: (n) => `${formatCompact(n)}${stat.suffix ?? ''}`
									}}
									class="font-heading text-2xl font-semibold text-olive tabular-nums transition-transform duration-300 group-hover:scale-110"
								>
									{stat.is_money
										? formatMoney(value)
										: `${formatCompact(value)}${stat.suffix ?? ''}`}
								</p>
								<p class="text-sm text-[oklch(0.94_0.012_80)]/65">
									{stat.label ?? key}
								</p>
							</div>
						{/each}
					</div>
				</div>
			{:else if block.type === 'quote'}
				<!-- `{ text, attribution }` -->
				<div class="mx-auto flex max-w-2xl justify-center">
					<div
						class="tilt-left shadow-warm relative rounded-[2rem] bg-card px-8 py-12 text-center sm:px-14"
					>
						<Quote
							class="absolute top-4 left-6 size-16 text-terracotta/15 sm:size-20"
							fill="currentColor"
						/>
						<p class="relative font-heading text-2xl leading-snug italic md:text-3xl">
							{str(block, 'text')}
						</p>
						{#if str(block, 'attribution')}
							<footer
								class="relative mt-5 flex items-center justify-center gap-3 text-sm text-muted-foreground"
							>
								<span class="h-px w-8 bg-olive/50"></span>
								{str(block, 'attribution')}
								<span class="h-px w-8 bg-olive/50"></span>
							</footer>
						{/if}
					</div>
				</div>
			{:else if block.type === 'cta_button'}
				<!-- `{ label, url, variant, note }` -->
				<div
					class="shadow-warm relative flex flex-col items-start gap-5 overflow-hidden rounded-[2rem] bg-clay-deep p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10"
				>
					<div
						class="pointer-events-none absolute -bottom-12 -left-10 size-48 rounded-full bg-olive/10 blur-3xl"
						aria-hidden="true"
					></div>
					<p class="relative max-w-md font-heading text-xl text-[oklch(0.94_0.012_80)] md:text-2xl">
						{str(block, 'note') || 'Every gift reaches a family this month, not a fund.'}
					</p>
					<a
						href={str(block, 'url') || '#'}
						class={cn(
							buttonVariants({ size: 'lg' }),
							'relative shrink-0 bg-olive text-clay-deep hover:bg-olive-bright'
						)}
					>
						{str(block, 'label') || 'Learn more'}
						<ArrowRight class="size-4" />
					</a>
				</div>
			{:else if block.type === 'pillar_grid'}
				<!-- `{ show_apply_links }` — the pillars themselves come from the
				     `pillars` table, never from this block's JSON. -->
				<div class="grid items-stretch gap-6 md:grid-cols-2">
					{#each pillars as pillar, pillarIndex (pillar.id)}
						<div
							use:reveal={{ delay: stagger(pillarIndex, 80, 4), scale: 0.95, blur: 6 }}
							class="flex"
						>
							<Card.Root class="card-lift group flex w-full flex-col gap-3 overflow-hidden p-0">
								{#if pillar.image}
									<div class="overflow-hidden">
										<img
											src={assetUrl(pillar.image)}
											alt={pillar.name}
											loading="lazy"
											class="aspect-video w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
										/>
									</div>
								{/if}
								<div class="flex flex-1 flex-col gap-3 p-7">
									<div
										class={cn(
											'w-fit rounded-2xl border p-3 transition-transform duration-300 group-hover:scale-110',
											accent(pillar.color)
										)}
									>
										<DynamicIcon name={pillar.icon} class="size-6" />
									</div>
									<h3 class="font-heading text-xl font-semibold">{pillar.name}</h3>
									{#if pillar.summary}
										<p class="text-muted-foreground">{pillar.summary}</p>
									{/if}
									<div class="mt-auto flex flex-wrap gap-2 pt-3">
										<a
											href={`/programs/${pillar.slug}`}
											class={buttonVariants({ variant: 'outline', size: 'sm' })}
										>
											Learn more
										</a>
										{#if block.content.show_apply_links !== false && pillar.hasPublicApplication}
											<a
												href={`/programs/${pillar.slug}#apply`}
												class={buttonVariants({ variant: 'ghost', size: 'sm' })}
											>
												Apply for support
											</a>
										{/if}
									</div>
								</div>
							</Card.Root>
						</div>
					{/each}
				</div>
			{:else if block.type === 'values_list'}
				<!-- `{ values: [{ icon, title, body }] }` -->
				<div class="grid gap-8 md:grid-cols-3">
					{#each list<Record<string, unknown>>(block, 'values') as value, valueIndex (valueIndex)}
						<div
							use:reveal={{ delay: stagger(valueIndex, 90, 3) }}
							class={cn(
								'flex flex-col gap-3',
								valueIndex % 2 === 0 ? 'sm:tilt-left' : 'sm:tilt-right'
							)}
						>
							<div
								class="group flex size-16 items-center justify-center rounded-full bg-clay-deep text-olive ring-4 ring-olive/15 transition-all duration-300 ease-out hover:scale-110 hover:rotate-6 hover:ring-olive/30"
							>
								<DynamicIcon
									name={String(value.icon ?? '')}
									class="size-7 transition-transform duration-300 ease-out group-hover:scale-110"
								/>
							</div>
							<h3 class="font-heading text-lg font-semibold">
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
					{#each initiatives as initiative, initiativeIndex (initiative.id)}
						<div use:reveal={{ delay: stagger(initiativeIndex, 80, 3) }} class="flex">
							<Card.Root class="card-lift flex w-full flex-col gap-3 p-0">
								{#if initiative.image}
									<img
										src={assetUrl(initiative.image)}
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
								<ArrowRight class="size-4" />
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
						<Card.Root class="flex flex-col gap-0 p-0">
							<TrimBand thin />
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
			{:else if block.type === 'gallery'}
				<!-- Photographs live in `media_items` keyed by this block, not in
				     `content` — they are managed on the shared media screen. -->
				<Gallery images={block.media?.gallery ?? []} />
			{:else if block.type === 'video'}
				<div class="mx-auto flex max-w-4xl flex-col gap-8">
					{#each block.media?.videos ?? [] as video, videoIndex (video.id)}
						<VideoEmbed
							url={video.youtubeUrl}
							caption={video.caption}
							title={block.heading ?? 'Video'}
							index={videoIndex}
						/>
					{/each}
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
				<div class="shadow-warm relative overflow-hidden rounded-[2rem] bg-clay-deep">
					<div
						class="pointer-events-none absolute -top-20 left-1/2 size-72 -translate-x-1/2 rounded-full bg-olive/10 blur-3xl"
						aria-hidden="true"
					></div>
					<TrimBand thin class="relative" />
					<div
						class="relative mx-auto flex max-w-2xl flex-col items-center gap-5 px-6 py-14 text-center sm:px-12"
					>
						{#if str(block, 'photo')}
							<img
								src={assetUrl(str(block, 'photo'))}
								alt={str(block, 'name')}
								class="size-28 rounded-full object-cover ring-4 ring-olive/25"
							/>
						{/if}
						{#if str(block, 'name')}
							<h3
								class="font-heading text-2xl font-semibold text-[oklch(0.97_0.01_80)] md:text-3xl"
							>
								{str(block, 'name')}
							</h3>
						{/if}
						<span class="h-px w-16 bg-olive/40"></span>
						<div
							class="prose-block prose-invert text-left text-[oklch(0.97_0.01_80)]/80 sm:text-center"
						>
							{@html str(block, 'body')}
						</div>
						{#if str(block, 'linkHref')}
							<a
								href={str(block, 'linkHref')}
								class={cn(
									buttonVariants({ size: 'lg' }),
									'mt-2 bg-olive text-clay-deep hover:bg-olive-bright'
								)}
							>
								{str(block, 'linkLabel') || 'Read more'}
							</a>
						{/if}
					</div>
					<TrimBand thin class="relative" />
				</div>
			{/if}
		</section>
	{/each}
</div>
