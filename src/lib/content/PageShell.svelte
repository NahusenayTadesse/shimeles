<script lang="ts">
	import { page as currentPage } from '$app/state';
	import BlockRenderer from '$lib/content/BlockRenderer.svelte';
	import PageHero from '$lib/content/PageHero.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import type {
		RenderInitiative,
		RenderPage,
		RenderPillar,
		RenderTestimonial
	} from '$lib/content/types';
	import type { ChartSeries } from '$lib/charts/types';
	import type { RenderForm } from '$lib/forms/types';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { MoneyTotal } from '$lib/money';

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
		charts = {},
		metrics = {},
		moneyTotals = {},
		payments = [],
		settings = {},
		forms = {},
		testimonials = [],
		labels = {},
		/** Rendered above the blocks, for routes with their own hero. */
		header,
		children
	}: {
		page: RenderPage;
		pillars?: RenderPillar[];
		initiatives?: RenderInitiative[];
		charts?: Record<string, ChartSeries>;
		metrics?: Record<string, number>;
		/** Money metric key → one total per currency; birr and dollars never merge. */
		moneyTotals?: Record<string, MoneyTotal[]>;
		payments?: any[];
		settings?: Record<string, string>;
		forms?: Record<
			string,
			{ definition: RenderForm; data: SuperValidated<Record<string, unknown>> }
		>;
		testimonials?: RenderTestimonial[];
		labels?: Record<string, string>;
		header?: import('svelte').Snippet;
		children?: import('svelte').Snippet;
	} = $props();

	/*
	 * The homepage carries the site-wide structured data and titles itself from
	 * the organisation rather than from its own row ("Home"). Both are decided
	 * from the path, because that is the one thing a shared shell can know for
	 * certain about which page it is drawing.
	 */
	const isHome = $derived(currentPage.url.pathname === '/');
</script>

<!-- The homepage's row is titled "Home": useless as a `<title>`, and useless as
     the alt text of a share image. Both fall through to the site's own name. -->
<Seo
	title={isHome ? null : page.title}
	description={page.metaDescription}
	image={page.shareImage}
	imageAlt={isHome ? null : page.title}
	organisation={isHome}
	breadcrumbs={isHome
		? []
		: [
				{ name: 'Home', path: '/' },
				{ name: page.title, path: currentPage.url.pathname }
			]}
/>

{#if header}
	{@render header()}
{:else}
	<PageHero title={page.title} description={page.metaDescription} image={page.shareImage} />
{/if}

<div class="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
	<BlockRenderer
		blocks={page.blocks}
		{pillars}
		{initiatives}
		{charts}
		{metrics}
		{moneyTotals}
		{payments}
		{forms}
		{testimonials}
		{labels}
		initiativeNotice={settings['initiatives.disclaimer'] ?? ''}
		paymentNotice={{
			en: settings['donation.notice_bank'] ?? '',
			am: settings['donation.notice_bank_am'] ?? ''
		}}
	/>
	{@render children?.()}
</div>
