<script lang="ts">
	import './layout.css';
	/*
	 * The two faces every page actually draws text in, imported for their URLs
	 * so they can be preloaded below. The rest of the subsets @fontsource ships
	 * — Cyrillic, Greek, Vietnamese — are left to their `unicode-range`, which
	 * means a browser rendering English never asks for them.
	 */
	import soraLatin from '@fontsource-variable/sora/files/sora-latin-wght-normal.woff2?url';
	import manropeLatin from '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url';
	import { ModeWatcher, mode } from 'mode-watcher';
	import { Toaster } from 'svelte-sonner';
	import { page } from '$app/state';
	import SiteNav from '$lib/components/site-nav.svelte';
	import SiteFooter from '$lib/components/site-footer.svelte';

	let { children, data } = $props();

	/**
	 * The dashboard brings its own sidebar shell, so the public header and
	 * footer are skipped there. Both live under one root layout so the language
	 * cookie, settings cache and toaster are configured once.
	 */
	const isDashboard = $derived(page.url.pathname.startsWith('/dashboard'));
	const isAuth = $derived(
		['/login', '/setup', '/forgot-password', '/reset-password'].includes(page.url.pathname)
	);
</script>

<svelte:head>
	<!-- Without these the browser finds the fonts only after it has downloaded
	     and parsed the stylesheet that names them — a second request in series,
	     about a second of it on a throttled connection, before a single heading
	     is drawn in the right face. `crossorigin` is not optional on a font
	     preload even from our own origin; without it the file is fetched twice. -->
	<link rel="preload" href={soraLatin} as="font" type="font/woff2" crossorigin="anonymous" />
	<link rel="preload" href={manropeLatin} as="font" type="font/woff2" crossorigin="anonymous" />

	<noscript>
		<!-- `use:reveal` starts elements hidden in CSS. Without JavaScript nothing
		     ever flips them on, so the page would render blank — this is the
		     escape hatch, not a nicety. -->
		<style>
			[data-reveal] {
				opacity: 1 !important;
				transform: none !important;
				filter: none !important;
			}
		</style>
	</noscript>
</svelte:head>

<ModeWatcher />
<Toaster theme={mode.current} richColors closeButton position="top-right" />

{#if isDashboard || isAuth}
	{@render children?.()}
{:else}
	<div class="site-shell flex min-h-screen flex-col">
		<SiteNav
			items={data.navigation?.header ?? []}
			siteNameAmharic={data.settings?.['site.name_am'] || 'ሽመልስ አበራ ፋውንዴሽን'}
			siteName={data.settings?.['site.name'] || 'Shimeles Abera Foundation'}
		/>
		<main class="flex-1">
			{@render children?.()}
		</main>
		<SiteFooter items={data.navigation?.footer ?? []} settings={data.settings ?? {}} />
	</div>
{/if}
