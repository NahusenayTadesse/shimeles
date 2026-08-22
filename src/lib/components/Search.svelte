<script lang="ts">
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { Search as SearchIcon } from '@lucide/svelte';
	import { dashboardSections } from '$lib/dashboard/nav';
	import type { Permission } from '$lib/permissions';

	let { permissions = [] }: { permissions?: Permission[] } = $props();

	const granted = $derived(new Set(permissions));
	const has = (permission?: Permission) => !permission || granted.has(permission);

	/**
	 * Every route the current user may open, flattened for the palette.
	 *
	 * A parent entry with sub-items (e.g. "Beneficiaries" → Beneficiaries,
	 * Households) always has its first sub-item pointing at the parent's own
	 * URL, so only the sub-items are listed — otherwise the same path would
	 * appear twice with a duplicate `each` key.
	 */
	const results = $derived(
		dashboardSections()
			.flatMap((section) => section.items)
			.filter((item) => has(item.permission))
			.flatMap((item) =>
				item.items
					? item.items
							.filter((sub) => has(sub.permission))
							.map((sub) => ({ label: sub.title, path: sub.url }))
					: [{ label: item.title, path: item.url }]
			)
	);

	let isOpen = $state(false);
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Trigger
		class={buttonVariants({ variant: 'outline', size: 'icon' })}
		title="Search the dashboard"
	>
		<SearchIcon class="size-4" />
		<span class="sr-only">Search</span>
	</Dialog.Trigger>
	<Dialog.Content class="max-w-lg! gap-4 overflow-hidden">
		<Dialog.Header>
			<Dialog.Title>Search the dashboard</Dialog.Title>
		</Dialog.Header>
		<Command.Root class="w-full min-w-0 rounded-lg border">
			<Command.Input placeholder="Type a page name..." />
			<Command.List>
				<Command.Empty>No results found.</Command.Empty>
				<Command.Group heading="Pages">
					{#each results as item (item.path)}
						<Command.LinkItem href={item.path} value={item.label} onSelect={() => (isOpen = false)}>
							{item.label}
						</Command.LinkItem>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Dialog.Content>
</Dialog.Root>
