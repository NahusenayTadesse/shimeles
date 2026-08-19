<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import { assetUrl } from '$lib/assets';
	import TrimBand from '$lib/components/trim-band.svelte';
	import { cn } from '$lib/utils';

	/**
	 * The organic hero band shared by every secondary page — the pillar pages,
	 * Donate, and the default header `PageShell` falls back to when a route
	 * doesn't bring its own. One consistent, calmer counterpart to the
	 * homepage's full-bleed hero, which is deliberately the one place the site
	 * spends its boldness.
	 *
	 * With an image it splits text and photo; without one it's a warm
	 * text-only band. Either way it closes on the trim band, the ornament that
	 * ties every page back to the same hand.
	 */
	let {
		eyebrow,
		title,
		description,
		image,
		imageAlt = '',
		icon,
		actions
	}: {
		eyebrow?: string;
		title: string;
		description?: string | null;
		image?: string | null;
		imageAlt?: string;
		icon?: import('svelte').Snippet;
		actions?: import('svelte').Snippet;
	} = $props();
</script>

<div class="relative overflow-hidden border-b bg-muted/40">
	<div
		class="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-olive/20 blur-3xl"
		aria-hidden="true"
	></div>
	<div
		class="pointer-events-none absolute -bottom-32 -left-16 size-72 rounded-full bg-clay/15 blur-3xl"
		aria-hidden="true"
	></div>

	<div
		class={cn(
			'relative mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 md:py-24',
			image && 'md:grid-cols-[1.1fr_0.9fr] md:items-center'
		)}
	>
		<div class="flex flex-col gap-5">
			{#if icon}
				<div use:reveal>
					{@render icon()}
				</div>
			{/if}
			{#if eyebrow}
				<p use:reveal class="eyebrow">{eyebrow}</p>
			{/if}
			<h1 use:reveal={{ delay: 60 }} class="max-w-xl font-heading text-4xl md:text-5xl">
				{title}
			</h1>
			{#if description}
				<p use:reveal={{ delay: 120 }} class="max-w-prose text-lg text-muted-foreground">
					{description}
				</p>
			{/if}
			{#if actions}
				<div use:reveal={{ delay: 180 }} class="mt-2 flex flex-wrap gap-3">
					{@render actions()}
				</div>
			{/if}
		</div>

		{#if image}
			<div use:reveal={{ delay: 100, x: 28, scale: 0.97 }} class="relative">
				<div
					class="absolute -inset-3 -z-10 rounded-[2.5rem] border-2 border-dashed border-olive/40"
					aria-hidden="true"
				></div>
				<img
					src={assetUrl(image)}
					alt={imageAlt}
					class="tilt-right shadow-warm aspect-[4/3] w-full rounded-[2rem] object-cover"
				/>
			</div>
		{/if}
	</div>

	<TrimBand class="absolute bottom-0 left-0 w-full" />
</div>
