<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { useSidebar } from '$lib/components/ui/sidebar/index.js';
	import type { ComponentProps } from 'svelte';
	import NavMain from './NavMain.svelte';
	import { visibleSections } from '$lib/dashboard/nav';
	import type { Permission } from '$lib/permissions';

	/**
	 * The dashboard sidebar.
	 *
	 * Every entry declares the permission it needs, and `visibleSections`
	 * filters the tree before it renders — a volunteer coordinator never sees a
	 * Finance link they would only get a 403 from, and a group left with
	 * nothing they may open collapses away entirely. This is presentation only:
	 * the routes themselves each call `requirePermission`, which is the actual
	 * control.
	 */
	let {
		permissions = [],
		counts = {},
		...restProps
	}: ComponentProps<typeof Sidebar.Root> & {
		permissions?: Permission[];
		counts?: Record<string, number>;
	} = $props();

	const visible = $derived(visibleSections(counts, permissions));

	const sidebar = useSidebar();
	const closeSidebar = () => {
		if (sidebar.isMobile) sidebar.setOpenMobile(false);
	};
</script>

<Sidebar.Root collapsible="offcanvas" {...restProps}>
	<Sidebar.Content
		class="z-[9999] flex h-full [scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent] flex-col overflow-y-auto pt-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent"
	>
		<div class="sticky top-0 z-10 border-b border-sidebar-border bg-sidebar px-4 py-4">
			<a href="/" target="_blank" title="Open the public site" class="flex flex-col gap-0.5">
				<span class="font-heading text-sm font-semibold text-sidebar-foreground"
					>Shimeles Abera</span
				>
				<span class="text-[10px] tracking-widest text-sidebar-foreground/60 uppercase"
					>Foundation</span
				>
			</a>
		</div>

		<div class="flex-1 py-2">
			<NavMain {closeSidebar} sections={visible} />
		</div>
	</Sidebar.Content>
</Sidebar.Root>
