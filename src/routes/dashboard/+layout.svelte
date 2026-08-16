<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import DarkMode from '$lib/components/DarkMode.svelte';
	import Search from '$lib/components/Search.svelte';
	import AvatarSettings from '$lib/components/AvatarSettings.svelte';

	let { children, data } = $props();
</script>

<svelte:head>
	<!-- Belt and braces alongside the X-Robots-Tag header in hooks.server.ts. -->
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<Sidebar.Provider>
	<AppSidebar permissions={data.access.permissions} counts={data.counts} />
	<main class="w-full min-w-0 px-2">
		<div
			class="absolute top-2 left-2 z-20 flex w-[95%] flex-row items-center justify-between rounded-lg bg-background/85 p-2 pr-4 align-middle shadow-lg backdrop-blur-md lg:sticky lg:w-full lg:pr-0"
		>
			<Sidebar.Trigger class="rounded-lg bg-white p-4 dark:bg-black" />
			<div class="flex items-center gap-3">
				{#if data.access.roleName}
					<span class="hidden text-xs text-muted-foreground sm:inline">{data.access.roleName}</span>
				{/if}
				<Search permissions={data.access.permissions} />
				<DarkMode />
				<AvatarSettings data={data.user?.name} />
			</div>
		</div>

		<div class="p-2 pt-24 pb-24 lg:pt-4 lg:pb-4">
			{@render children?.()}
		</div>
	</main>
</Sidebar.Provider>
