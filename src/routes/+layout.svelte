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
	import { onNavigate } from '$app/navigation';
	import SiteNav from '$lib/components/site-nav.svelte';
	import SiteFooter from '$lib/components/site-footer.svelte';
	import SeasonBanner from '$lib/components/season-banner.svelte';
	import NextSteps from '$lib/components/next-steps.svelte';

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

	/**
	 * A short crossfade between public pages, through the browser's own View
	 * Transitions API — no library, and nothing at all on a browser without it,
	 * which simply changes page the way it always did.
	 *
	 * Skipped for the dashboard (staff are working, not browsing), for a
	 * navigation that stays on the same page (a filter, a tab), and under
	 * reduced motion. The header carries its own `view-transition-name`, so it
	 * holds still while the page beneath it changes.
	 */
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const from = navigation.from?.url;
		const to = navigation.to?.url;
		if (!from || !to || from.pathname === to.pathname) return;
		if (to.pathname.startsWith('/dashboard') || from.pathname.startsWith('/dashboard')) return;

		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	const str = (key: string, fallback: string) => data.strings?.[key] ?? fallback;
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
		<!-- First thing a keyboard reaches: past the header, straight to the page. -->
		<a
			href="#main"
			class="sr-only rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
		>
			{str('nav.skip_to_content', 'Skip to content')}
		</a>
		<SiteNav
			items={data.navigation?.header ?? []}
			siteNameAmharic={data.settings?.['site.name_am'] || 'ሽመልስ አበራ ፋውንዴሽን'}
			siteName={data.settings?.['site.name'] || 'Shimeles Abera Foundation'}
		/>
		<SeasonBanner
			enabled={data.settings?.['season.banner_enabled'] === 'true'}
			message={data.settings?.['season.banner_message'] ?? ''}
			href={data.settings?.['season.banner_link'] || null}
		/>
		<main id="main" tabindex="-1" class="flex-1 outline-none">
			{@render children?.()}
		</main>
		<NextSteps
			items={data.navigation?.header ?? []}
			heading={str('nav.next_heading', 'Where to next')}
		/>
		<SiteFooter items={data.navigation?.footer ?? []} settings={data.settings ?? {}} />
	</div>
{/if}
