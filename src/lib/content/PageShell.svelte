<script lang="ts">
	import BlockRenderer from '$lib/content/BlockRenderer.svelte';
	import PageHero from '$lib/content/PageHero.svelte';
	import type { RenderInitiative, RenderPage, RenderPillar } from '$lib/content/types';
	import type { RenderForm } from '$lib/forms/types';
	import type { SuperValidated } from 'sveltekit-superforms';

	/**
	 * The shell every content-driven public page shares: head tags, the page
	 * title, and the block list. It exists so the route files stay two lines —
	 * a `load` and this component — which is the point of §6's "no page
	 * template contains prose".
	 */
	let {
		page,
		pillars = [],
		initiatives = [],
		metrics = {},
		payments = [],
		settings = {},
		forms = {},
		labels = {},
		/** Rendered above the blocks, for routes with their own hero. */
		header,
		children
	}: {
		page: RenderPage;
		pillars?: RenderPillar[];
		initiatives?: RenderInitiative[];
		metrics?: Record<string, number>;
		payments?: any[];
		settings?: Record<string, string>;
		forms?: Record<string, { definition: RenderForm; data: SuperValidated<Record<string, unknown>> }>;
		labels?: Record<string, string>;
		header?: import('svelte').Snippet;
		children?: import('svelte').Snippet;
	} = $props();

	const siteName = $derived(settings['site.name'] || 'Shimeles Abera Foundation');
</script>

<svelte:head>
	<title>{page.title} · {siteName}</title>
	{#if page.metaDescription}
		<meta name="description" content={page.metaDescription} />
	{/if}
	<meta property="og:title" content={`${page.title} · ${siteName}`} />
	{#if page.metaDescription}
		<meta property="og:description" content={page.metaDescription} />
	{/if}
	{#if page.shareImage}
		<meta property="og:image" content={`/files/${page.shareImage}`} />
	{/if}
</svelte:head>

{#if header}
	{@render header()}
{:else}
	<PageHero title={page.title} description={page.metaDescription} image={page.shareImage} />
{/if}

<div class="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
	<BlockRenderer blocks={page.blocks} {pillars} {initiatives} {metrics} {payments} {forms} {labels} />
	{@render children?.()}
</div>
