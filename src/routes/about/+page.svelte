<script lang="ts">
	import { reveal, stagger } from '$lib/actions/reveal';
	import { assetUrl } from '$lib/assets';
	import { formatMoney } from '$lib/money';
	import PageHero from '$lib/content/PageHero.svelte';
	import TrimBand from '$lib/components/trim-band.svelte';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import VideoEmbed from '$lib/content/VideoEmbed.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { BookOpen, Compass, Film, Quote, Target } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	/**
	 * About is a hand-built route rather than `content_blocks` — see the note
	 * at the top of `schema.ts`. Sections, icons and layout are fixed here;
	 * only the paragraphs, the two hero photographs, the video and the memorial
	 * gallery come from the database (`about_content` and the `about`
	 * collection in `media_items`, edited from Dashboard → About page).
	 */
	let { data } = $props();

	const content = $derived(data.content);
	const siteName = $derived(data.settings?.['site.name'] || 'Shimeles Abera Foundation');

	/** Which photo the memorial's main frame is showing — starts on the hero
	 *  portrait, and swaps to whichever gallery thumbnail was clicked. */
	let memoriamPhoto = $state<{ storagePath: string; caption?: string | null } | null>(null);
	const memoriamMainPhoto = $derived(
		memoriamPhoto ??
			(content?.memoriamHeroImage ? { storagePath: content.memoriamHeroImage } : data.gallery[0])
	);
</script>

<svelte:head>
	<title>About Us · {siteName}</title>
	<meta
		name="description"
		content={content?.metaDescription ||
			'Who we are, why the Foundation exists, and the man it is named for.'}
	/>
	<meta property="og:title" content={`About Us · ${siteName}`} />
	{#if content?.heroImage}
		<meta property="og:image" content={`/files/${content.heroImage}`} />
	{/if}
</svelte:head>

<PageHero
	eyebrow="A family foundation · Addis Ababa"
	title="About Us"
	description="Who we are, why the Foundation exists, and the man it is named for."
	image={content?.heroImage}
	imageAlt="The Shimeles Abera Foundation at work"
/>

<div class="mx-auto flex w-full max-w-6xl flex-col gap-20 px-4 py-16 md:gap-28 md:py-24">
	<!-- Our Story -->
	<section use:reveal class="mx-auto flex max-w-3xl flex-col gap-6">
		<div class="flex items-center gap-3">
			<div class="flex size-11 items-center justify-center rounded-full bg-accent text-primary">
				<BookOpen class="size-5" />
			</div>
			<div class="flex flex-col gap-1">
				<span class="eyebrow">Our Story</span>
				<span class="h-[3px] w-10 rounded-full bg-olive"></span>
			</div>
		</div>
		{#if content?.storyBody}
			<div class="prose-block prose-lede">
				{@html content.storyBody}
			</div>
		{:else}
			<p class="text-muted-foreground">
				This foundation carries the name of Shimeles Abera, and it was built by the people who knew
				him.
			</p>
		{/if}
	</section>

	<!-- Watch.
	     Sits directly after Our Story, because that is the sentence it
	     finishes: you read what the Foundation is, then you see it. The
	     dashed frame is the same ornament the hero photograph carries, which
	     is what stops a black rectangle reading as a foreign object on a page
	     this warm. -->
	{#if data.videos.length}
		{@const featured = data.videos[0]}
		{@const rest = data.videos.slice(1)}
		<section class="flex flex-col gap-8">
			<!-- Shares the video's container so the label sits flush with the
			     frame rather than floating off at the page edge. -->
			<div class="mx-auto flex w-full max-w-4xl items-center gap-3">
				<div class="flex size-11 items-center justify-center rounded-full bg-accent text-primary">
					<Film class="size-5" />
				</div>
				<div class="flex flex-col gap-1">
					<span class="eyebrow">Watch</span>
					<span class="h-[3px] w-10 rounded-full bg-olive"></span>
				</div>
			</div>

			<div use:reveal={{ scale: 0.98 }} class="relative mx-auto w-full max-w-4xl">
				<div
					class="absolute -inset-3 -z-10 rounded-[2.5rem] border-2 border-dashed border-olive/40 md:-inset-5"
					aria-hidden="true"
				></div>
				<!-- Kept inside the container's right edge on purpose: an absolutely
				     positioned decoration that hangs off the side still counts
				     towards scrollable overflow, which on a phone shows up as the
				     whole page sliding sideways. -->
				<div
					class="pointer-events-none absolute -top-16 right-0 -z-10 size-56 rounded-full bg-olive/15 blur-3xl"
					aria-hidden="true"
				></div>
				<VideoEmbed
					url={featured.youtubeUrl}
					caption={featured.caption}
					title="About the Foundation"
				/>
			</div>

			{#if rest.length}
				<!-- Anything beyond the first is a supporting clip, so it is sized
				     as one rather than repeating the full-width treatment. -->
				<div class="mx-auto grid w-full max-w-4xl gap-6 sm:grid-cols-2">
					{#each rest as video, index (video.id)}
						<VideoEmbed
							url={video.youtubeUrl}
							caption={video.caption}
							title="About the Foundation"
							index={index + 1}
						/>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	<!-- Mission & Vision -->
	<section class="flex flex-col gap-8">
		<div class="mx-auto max-w-2xl text-center">
			<span class="eyebrow">What we're working towards</span>
			<h2 class="mt-2 text-3xl md:text-4xl">Mission &amp; Vision</h2>
		</div>
		<div class="grid gap-6 md:grid-cols-2">
			<div
				use:reveal={{ delay: stagger(0, 100, 2) }}
				class="shadow-warm flex flex-col gap-4 rounded-[2rem] border bg-card p-8"
			>
				<div
					class="group flex size-16 items-center justify-center rounded-full bg-clay-deep text-olive ring-4 ring-olive/15 transition-all duration-300 ease-out hover:scale-110 hover:rotate-6 hover:ring-olive/30"
				>
					<Target class="size-7 transition-transform duration-300 ease-out group-hover:scale-110" />
				</div>
				<h3 class="font-heading text-xl font-semibold">Our Mission</h3>
				<p class="whitespace-pre-line text-muted-foreground">
					{content?.missionText ||
						'To stand with families in Ethiopia through medical hardship, old age, mental strain and the cost of education — with practical help, and with presence.'}
				</p>
			</div>
			<div
				use:reveal={{ delay: stagger(1, 100, 2) }}
				class="shadow-warm flex flex-col gap-4 rounded-[2rem] border bg-card p-8"
			>
				<div
					class="group flex size-16 items-center justify-center rounded-full bg-clay-deep text-olive ring-4 ring-olive/15 transition-all duration-300 ease-out hover:scale-110 hover:rotate-6 hover:ring-olive/30"
				>
					<Compass
						class="size-7 transition-transform duration-300 ease-out group-hover:scale-110"
					/>
				</div>
				<h3 class="font-heading text-xl font-semibold">Our Vision</h3>
				<p class="whitespace-pre-line text-muted-foreground">
					{content?.visionText ||
						'An Ethiopia where a medical emergency does not bankrupt a family, an elder is not alone, asking for help with your mental health costs nothing socially, and a bright child stays in school regardless of what their family earns.'}
				</p>
			</div>
		</div>
	</section>

	<!-- Quote -->
	<section class="mx-auto flex max-w-2xl justify-center">
		<div
			class="tilt-left shadow-warm relative rounded-[2rem] bg-card px-8 py-12 text-center sm:px-14"
		>
			<Quote
				class="absolute top-4 left-6 size-16 text-terracotta/15 sm:size-20"
				fill="currentColor"
			/>
			<p class="relative font-heading text-2xl leading-snug italic md:text-3xl">
				Nobody should face the hardest days alone.
			</p>
			<footer
				class="relative mt-5 flex items-center justify-center gap-3 text-sm text-muted-foreground"
			>
				<span class="h-px w-8 bg-olive/50"></span>
				The Shimeles Abera Foundation
				<span class="h-px w-8 bg-olive/50"></span>
			</footer>
		</div>
	</section>
</div>

<!-- In Memoriam — full-bleed, edge to edge, so the photo actually reads as
     large rather than sitting boxed inside the same column as everything
     else on the page. -->
<section id="in-memoriam" class="scroll-mt-20 py-16 md:py-24">
	<div class="mb-10 flex flex-col items-center gap-2 text-center">
		<span class="eyebrow">In Memoriam</span>
		<h2 class="text-3xl md:text-4xl">{content?.memoriamName || 'Shimeles Abera'}</h2>
		<span class="h-[3px] w-14 rounded-full bg-olive"></span>
	</div>

	<div class="shadow-warm relative w-full overflow-hidden bg-clay-deep">
		<div
			class="pointer-events-none absolute -top-24 left-1/2 size-96 -translate-x-1/2 rounded-full bg-olive/10 blur-3xl"
			aria-hidden="true"
		></div>
		<TrimBand thin class="relative" />

		<div
			class="relative grid gap-10 px-4 py-14 sm:px-8 md:grid-cols-[1.35fr_1fr] md:items-stretch md:gap-0 lg:px-16"
		>
			<!-- Photo: a big main frame, with the gallery underneath acting as
			     the picker. Clicking a thumbnail swaps what the frame shows. -->
			<div class="flex flex-col gap-5 md:pr-12">
				{#if memoriamMainPhoto}
					{#key memoriamMainPhoto.storagePath}
						<img
							use:reveal={{ scale: 0.98 }}
							src={assetUrl(memoriamMainPhoto.storagePath)}
							alt={memoriamMainPhoto.caption || content?.memoriamName || 'Shimeles Abera'}
							class="shadow-warm h-[24rem] w-full rounded-[1.75rem] object-cover sm:h-[30rem] lg:h-[36rem]"
						/>
					{/key}
				{/if}

				{#if data.gallery.length}
					<div class="grid grid-cols-4 gap-4 sm:grid-cols-5">
						{#each data.gallery as image, index (image.id)}
							{@const active = memoriamMainPhoto?.storagePath === image.storagePath}
							<button
								type="button"
								use:reveal={{ delay: stagger(index, 50, 6) }}
								onclick={() => (memoriamPhoto = image)}
								aria-label={image.caption || `Photo ${index + 1}`}
								aria-pressed={active}
								class={cn(
									'aspect-square overflow-hidden rounded-2xl ring-[3px] transition-all duration-200 hover:-translate-y-0.5',
									active
										? 'shadow-warm ring-olive-bright'
										: 'opacity-90 ring-transparent hover:opacity-100 hover:ring-olive/50'
								)}
							>
								<img
									src={assetUrl(image.storagePath)}
									alt=""
									loading="lazy"
									class="size-full object-cover"
								/>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Text -->
			<div
				class="flex flex-col justify-center gap-5 py-4 md:border-l md:border-olive/15 md:py-0 md:pl-12"
			>
				{#if content?.memoriamBody}
					<div class="prose-block prose-invert text-[oklch(0.97_0.01_80)]/80">
						{@html content.memoriamBody}
					</div>
				{/if}
			</div>
		</div>
		<TrimBand thin class="relative" />
	</div>
</section>

<!-- What we're building next -->
{#if data.initiatives.length}
	<div class="mx-auto flex w-full max-w-6xl flex-col px-4 pb-16 md:pb-24">
		<section class="flex flex-col gap-8">
			<div class="flex flex-col gap-2">
				<h2 class="text-3xl md:text-4xl">What we are building next</h2>
				<span class="h-[3px] w-14 rounded-full bg-olive"></span>
			</div>
			<div class="grid gap-6 md:grid-cols-3">
				{#each data.initiatives as initiative, index (initiative.id)}
					<div use:reveal={{ delay: stagger(index, 80, 3) }} class="flex">
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
		</section>
	</div>
{/if}
