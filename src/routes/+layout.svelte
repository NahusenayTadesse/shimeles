<script lang="ts">
	import './layout.css';
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
			siteName={data.settings?.['site.name'] || 'Shimeles Abera Foundation'}
		/>
		<main class="flex-1">
			{@render children?.()}
		</main>
		<SiteFooter items={data.navigation?.footer ?? []} settings={data.settings ?? {}} />
	</div>
{/if}
