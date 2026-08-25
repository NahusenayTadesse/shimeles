<script lang="ts">
	import { page } from '$app/state';
	import {
		articleJsonLd,
		breadcrumbJsonLd,
		organisationJsonLd,
		resolveSeo,
		websiteJsonLd,
		type SeoInput
	} from '$lib/seo';

	/**
	 * Every public page's head, in one place.
	 *
	 * A route passes only what is true of *that page* — title, description, its
	 * own image — and this fills in the site name, the absolute origin, the
	 * canonical URL, the Open Graph and Twitter cards and the structured data.
	 * Settings arrive through `page.data`, which the root layout loads for every
	 * request, so a call site never has to thread them through.
	 *
	 * Deliberately not in the root layout: the layout does not know what page it
	 * is rendering, and a head assembled from `page.data` guesswork is how you
	 * end up with a blog post advertising the homepage's description.
	 */
	let {
		breadcrumbs = [],
		organisation = false,
		article = false,
		...seo
	}: SeoInput & {
		/** Renders a `BreadcrumbList`. Pass the trail the page itself shows. */
		breadcrumbs?: { name: string; path: string }[];
		/** The site-wide `NGO` + `WebSite` graph. Homepage only — it is one fact. */
		organisation?: boolean;
		/** Emit `BlogPosting` structured data from the article fields. */
		article?: boolean;
	} = $props();

	const settings = $derived((page.data?.settings ?? {}) as Record<string, string>);
	const resolved = $derived(resolveSeo(seo, settings, page.url));

	/**
	 * A closing script tag inside a JSON string would end the block early, and
	 * the rest of the document after it would be parsed as script. Escaping `<`
	 * is the standard defence, and it stays valid JSON either way.
	 */
	const ldScript = (data: unknown) =>
		`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</${'script'}>`;

	const graphs = $derived([
		...(organisation
			? [organisationJsonLd(settings, resolved.origin), websiteJsonLd(settings, resolved.origin)]
			: []),
		...(breadcrumbs.length ? [breadcrumbJsonLd(breadcrumbs, resolved.origin)] : []),
		...(article
			? [
					articleJsonLd(
						{
							title: seo.title ?? resolved.title,
							description: resolved.description,
							url: resolved.canonical,
							image: resolved.image,
							publishedAt: resolved.publishedAt,
							modifiedAt: resolved.modifiedAt,
							author: resolved.author,
							section: resolved.section
						},
						settings,
						resolved.origin
					)
				]
			: [])
	]);
</script>

<svelte:head>
	<title>{resolved.title}</title>
	<meta name="description" content={resolved.description} />
	<meta name="robots" content={resolved.robots} />
	<link rel="canonical" href={resolved.canonical} />

	<meta property="og:site_name" content={resolved.siteName} />
	<meta property="og:type" content={resolved.type} />
	<meta property="og:title" content={resolved.title} />
	<meta property="og:description" content={resolved.description} />
	<meta property="og:url" content={resolved.canonical} />
	<meta property="og:locale" content={resolved.locale} />
	<meta property="og:image" content={resolved.image} />
	<meta property="og:image:alt" content={resolved.imageAlt} />
	{#if resolved.imageWidth && resolved.imageHeight}
		<!-- Only asserted for the card we ship and therefore measured. Facebook
		     lays the preview out from these before it has fetched the file; a
		     guess here is a preview that jumps or crops wrong. -->
		<meta property="og:image:width" content={resolved.imageWidth} />
		<meta property="og:image:height" content={resolved.imageHeight} />
	{/if}

	<!-- `summary_large_image` is the difference between a postage stamp beside
	     the text and a full-width photo above it. -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={resolved.title} />
	<meta name="twitter:description" content={resolved.description} />
	<meta name="twitter:image" content={resolved.image} />
	<meta name="twitter:image:alt" content={resolved.imageAlt} />

	{#if resolved.type === 'article'}
		{#if resolved.publishedAt}
			<meta property="article:published_time" content={resolved.publishedAt} />
		{/if}
		{#if resolved.modifiedAt}
			<meta property="article:modified_time" content={resolved.modifiedAt} />
		{/if}
		{#if resolved.author}<meta property="article:author" content={resolved.author} />{/if}
		{#if resolved.section}<meta property="article:section" content={resolved.section} />{/if}
		{#each resolved.tags as tag (tag)}
			<meta property="article:tag" content={tag} />
		{/each}
	{/if}

	{#each graphs as graph, index (index)}
		<!-- Not user HTML: `JSON.stringify` of an object this module built, with
		     every `<` escaped to `\u003c` on the way out, so nothing in it can
		     open a tag. `{@html}` is the only way to put a script element in the
		     head from a component. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html ldScript(graph)}
	{/each}
</svelte:head>
