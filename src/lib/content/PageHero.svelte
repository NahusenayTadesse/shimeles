<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import { assetUrl, imageSrcset } from '$lib/assets';
	import Breadcrumbs from '$lib/components/breadcrumbs.svelte';
	import { cn } from '$lib/utils';

	/**
	 * The organic hero band shared by every secondary page — the pillar pages,
	 * Donate, and the default header `PageShell` falls back to when a route
	 * doesn't bring its own. One consistent, calmer counterpart to the
	 * homepage's full-bleed hero, which is deliberately the one place the site
	 * spends its boldness.
	 *
	 * Forest green, like the homepage, so every page opens on the same ground.
	 * With an image, the photograph stands in its frame beside the title; without
	 * one it is the title alone.
	 */
	let {
		eyebrow,
		title,
		description,
		image,
		imageAlt = '',
		icon,
		actions,
		breadcrumbs = [],
		breadcrumbLabel
	}: {
		eyebrow?: string;
		title: string;
		description?: string | null;
		image?: string | null;
		imageAlt?: string;
		icon?: import('svelte').Snippet;
		actions?: import('svelte').Snippet;
		/** The trail the page gives `<Seo>`; shown from three steps deep. */
		breadcrumbs?: { name: string; path: string }[];
		breadcrumbLabel?: string;
	} = $props();
</script>

<div class="on-sun sun-surface relative isolate overflow-hidden">
	<div
		class={cn(
			'wrap relative grid gap-8 pt-8 pb-12 md:pt-12 md:pb-16',
			image && 'md:grid-cols-2 md:items-center md:gap-[clamp(3rem,6vw,9rem)]'
		)}
	>
		<div class="flex flex-col gap-5">
			<Breadcrumbs items={breadcrumbs} label={breadcrumbLabel} />
			{#if icon}
				<div>
					{@render icon()}
				</div>
			{/if}
			{#if eyebrow}
				<p
					use:reveal={{ orchestrate: true }}
					class="text-[clamp(1.1rem,0.9rem+0.5vw,1.4rem)] font-medium text-(--gold-deep)"
				>
					{eyebrow}
				</p>
			{/if}
			<h1
				use:reveal={{ orchestrate: true, delay: 60 }}
				class="max-w-3xl text-[clamp(2.5rem,1.3rem+3.6vw,5rem)] text-(--forest)"
			>
				{title}
			</h1>
			{#if description}
				<p
					use:reveal={{ orchestrate: true, delay: 120 }}
					class="max-w-[40ch] text-[clamp(1.15rem,0.9rem+0.7vw,1.6rem)] leading-relaxed"
				>
					{description}
				</p>
			{/if}
			{#if actions}
				<div use:reveal={{ orchestrate: true, delay: 180 }} class="mt-2 flex flex-wrap gap-3">
					{@render actions()}
				</div>
			{/if}
		</div>

		{#if image}
			<!-- No `use:reveal` on the photograph, deliberately: it is the
			     largest-contentful-paint element on every page that has one, and an
			     entrance would hold it invisible after it had arrived. -->
			<div
				class="relative w-[62%] max-w-[20rem] md:w-[min(100%,calc((100svh-22rem)*0.8))] md:max-w-[30rem] md:justify-self-end"
			>
				<div
					class="photo-frame-line pointer-events-none absolute inset-x-0 top-0 -z-10 translate-x-4 translate-y-4"
					aria-hidden="true"
				></div>
				<!-- `fetchpriority="high"` and not lazy: above the fold on every page
				     that uses this. The intrinsic size matches the 4:5 frame, which is
				     what keeps the layout from shifting when it lands. -->
				<img
					src={assetUrl(image)}
					srcset={imageSrcset(image)}
					sizes="(min-width: 768px) 30rem, 62vw"
					alt={imageAlt}
					width="640"
					height="800"
					fetchpriority="high"
					decoding="async"
					class="photo-frame w-full object-cover"
				/>
			</div>
		{/if}
	</div>
</div>
