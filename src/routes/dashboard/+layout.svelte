<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import DarkMode from '$lib/components/DarkMode.svelte';
	import Search from '$lib/components/Search.svelte';
	import AvatarSettings from '$lib/components/AvatarSettings.svelte';
	import BackupButton from '$lib/components/BackupButton.svelte';
	import EntityTabs from '$lib/components/entity-tabs.svelte';

	let { children, data } = $props();
</script>

<svelte:head>
	<!-- Belt and braces alongside the X-Robots-Tag header in hooks.server.ts. -->
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<Sidebar.Provider>
	<AppSidebar permissions={data.access.permissions} counts={data.counts} />
	<main class="w-full min-w-0 px-2">
		<!--
			Sticky at every width, not floating above the page below phone size.
			Absolutely positioning it meant reserving space by hand — six rems of
			blank page under a bar that was only three tall — so every screen on a
			phone opened on a gap, and the entity bar and the page's own heading
			started below the fold.
		-->
		<div
			class="sticky top-0 z-20 -mx-2 flex flex-row items-center justify-between gap-2 border-b border-border bg-background/85 px-2 py-2 align-middle backdrop-blur-md lg:mx-0 lg:rounded-lg lg:border-0 lg:pr-0 lg:shadow-lg"
		>
			<Sidebar.Trigger class="rounded-lg bg-white p-2.5 lg:p-4 dark:bg-black" />
			<div class="flex items-center gap-3">
				{#if data.access.roleName}
					<span class="hidden text-xs text-muted-foreground sm:inline">{data.access.roleName}</span>
				{/if}
				<Search permissions={data.access.permissions} />

				<DarkMode />
				<AvatarSettings data={data.user?.name} />
				{#if data.access.isSuperAdmin}
					<BackupButton lastBackupAt={data.lastBackupAt} />
				{/if}
			</div>
		</div>

		<div class="p-2 pt-4 pb-24 lg:pb-4">
			<EntityTabs permissions={data.access.permissions} counts={data.counts} />
			{@render children?.()}
		</div>
	</main>
</Sidebar.Provider>
