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
	 * With an image, the photograph stands in the arch beside the title; without
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

<div class="on-forest relative isolate overflow-hidden bg-(--forest)">
	<div
		class={cn(
			'relative mx-auto grid w-full max-w-6xl gap-10 px-4 pt-10 pb-16 md:pt-16 md:pb-24',
			image && 'md:grid-cols-[1.25fr_0.75fr] md:items-center md:gap-16'
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
				<p use:reveal={{ orchestrate: true }} class="text-lg font-medium text-(--gold)">
					{eyebrow}
				</p>
			{/if}
			<h1
				use:reveal={{ orchestrate: true, delay: 60 }}
				class="max-w-3xl text-[clamp(2.3rem,5vw,3.9rem)] text-[#f6f3e6]"
			>
				{title}
			</h1>
			{#if description}
				<p
					use:reveal={{ orchestrate: true, delay: 120 }}
					class="max-w-prose text-lg leading-relaxed md:text-xl"
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
			<div class="relative w-[70%] max-w-[22rem] md:w-full md:justify-self-end">
				<div
					class="arch-line pointer-events-none absolute inset-x-0 top-0 -z-10 translate-x-4 translate-y-4"
					aria-hidden="true"
				></div>
				<!-- `fetchpriority="high"` and not lazy: above the fold on every page
				     that uses this. The intrinsic size matches the 4:5 arch, which is
				     what keeps the layout from shifting when it lands. -->
				<img
					src={assetUrl(image)}
					srcset={imageSrcset(image)}
					sizes="(min-width: 768px) 22rem, 70vw"
					alt={imageAlt}
					width="640"
					height="800"
					fetchpriority="high"
					decoding="async"
					class="arch w-full object-cover"
				/>
			</div>
		{/if}
	</div>
</div>
