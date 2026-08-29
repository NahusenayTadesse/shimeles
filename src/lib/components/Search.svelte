<script lang="ts">
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { Search as SearchIcon } from '@lucide/svelte';
	import { dashboardSections } from '$lib/dashboard/nav';
	import type { Permission } from '$lib/permissions';

	/**
	 * The command palette.
	 *
	 * It used to jump between pages and nothing else, with no keyboard binding
	 * — which is not what a magnifying glass in a header promises. Staff typed
	 * a reference number or a person's name into it, got nothing back, and
	 * concluded the system could not find their case.
	 *
	 * So it now asks `/dashboard/search` as well, which applies each entity's
	 * read permission and pillar scope and audits the lookup. Pages are still
	 * matched locally: they are a fixed list and should not wait on a request.
	 */

	let { permissions = [] }: { permissions?: Permission[] } = $props();

	const granted = $derived(new Set(permissions));
	const has = (permission?: Permission) => !permission || granted.has(permission);

	/**
	 * Every route the current user may open, flattened for the palette.
	 *
	 * A group is listed under its own name — "Volunteers", not only "All
	 * volunteers" — because the entity is what somebody types. Its first child
	 * always points at the group's own URL, so that child is dropped rather
	 * than listed twice; every remaining path is unique, which the `each` key
	 * relies on.
	 */
	const pages = $derived(
		dashboardSections()
			.flatMap((section) => section.items)
			.filter((item) => has(item.permission))
			.flatMap((item) =>
				item.items
					? [
							{ label: item.title, path: item.url },
							...item.items
								.filter((sub) => has(sub.permission) && sub.url !== item.url)
								.map((sub) => ({ label: sub.title, path: sub.url }))
						]
					: [{ label: item.title, path: item.url }]
			)
	);

	let isOpen = $state(false);
	let term = $state('');

	type RecordHit = { group: string; label: string; hint: string; href: string };
	let records = $state<RecordHit[]>([]);
	let searching = $state(false);

	/** The Mac convention, shown on the trigger so it is discoverable at all. */
	const isMac =
		typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform ?? '');

	/** Whether the keystroke landed in something the person is typing into. */
	function isTyping(target: EventTarget | null) {
		const element = target as HTMLElement | null;
		if (!element) return false;
		const tag = element.tagName;
		return (
			tag === 'INPUT' ||
			tag === 'TEXTAREA' ||
			tag === 'SELECT' ||
			element.isContentEditable === true
		);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			isOpen = !isOpen;
			return;
		}

		// A bare "?" or "/" opens it too — the shortcut people try first, and the
		// one they can reach without knowing the modifier. Guarded on whether
		// they are typing, since both are ordinary characters in a search box or
		// a slug field.
		if (
			(event.key === '?' || event.key === '/') &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.altKey
		) {
			if (isTyping(event.target)) return;
			event.preventDefault();
			isOpen = true;
		}
	}

	/*
	 * One request per pause in typing, and only past three characters — a
	 * two-letter term matches half the database. `controller` cancels the
	 * previous lookup so a slow response cannot overwrite a newer one.
	 */
	let debounce: ReturnType<typeof setTimeout>;
	let controller: AbortController | undefined;

	$effect(() => {
		const query = term.trim();
		clearTimeout(debounce);
		controller?.abort();

		if (query.length < 3) {
			records = [];
			searching = false;
			return;
		}

		searching = true;
		debounce = setTimeout(async () => {
			controller = new AbortController();
			try {
				const response = await fetch(`/dashboard/search?q=${encodeURIComponent(query)}`, {
					signal: controller.signal
				});
				records = response.ok ? ((await response.json()).results ?? []) : [];
			} catch {
				// An aborted request is the normal case here, not a failure.
			} finally {
				searching = false;
			}
		}, 250);

		return () => clearTimeout(debounce);
	});

	/** Records arrive flat; the palette groups them under their entity. */
	const grouped = $derived(
		records.reduce<Record<string, RecordHit[]>>((groups, hit) => {
			(groups[hit.group] ??= []).push(hit);
			return groups;
		}, {})
	);

	function close() {
		isOpen = false;
		term = '';
		records = [];
	}
</script>

<svelte:window {onkeydown} />

<Dialog.Root bind:open={isOpen}>
	<Dialog.Trigger
		class={buttonVariants({ variant: 'outline', size: 'icon' })}
		title="Search records and pages ({isMac ? '⌘K' : 'Ctrl K'}, or ?)"
	>
		<SearchIcon class="size-4" />
		<span class="sr-only">Search records and pages</span>
	</Dialog.Trigger>
	<Dialog.Content class="max-w-lg! gap-4 overflow-hidden">
		<Dialog.Header>
			<Dialog.Title class="flex items-center justify-between gap-2">
				Search
				<kbd
					class="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
				>
					{isMac ? '⌘K' : 'Ctrl K'}
				</kbd>
			</Dialog.Title>
		</Dialog.Header>
		<Command.Root class="w-full min-w-0 rounded-lg border" shouldFilter={false}>
			<Command.Input placeholder="A name, a reference number, or a page…" bind:value={term} />
			<Command.List>
				<Command.Empty>
					{#if searching}
						Searching…
					{:else if term.trim().length > 0 && term.trim().length < 3}
						Keep typing, three characters or more.
					{:else}
						Nothing matches that.
					{/if}
				</Command.Empty>

				{#each Object.entries(grouped) as [group, hits] (group)}
					<Command.Group heading={group}>
						{#each hits as hit (hit.href + hit.label)}
							<Command.LinkItem href={hit.href} value={hit.label} onSelect={close}>
								<span class="truncate">{hit.label}</span>
								{#if hit.hint}
									<span class="ml-auto pl-3 font-mono text-xs text-muted-foreground">
										{hit.hint}
									</span>
								{/if}
							</Command.LinkItem>
						{/each}
					</Command.Group>
				{/each}

				{@const matchingPages = pages.filter((item) =>
					item.label.toLowerCase().includes(term.trim().toLowerCase())
				)}
				{#if matchingPages.length}
					<Command.Group heading="Pages">
						{#each matchingPages as item (item.path)}
							<Command.LinkItem href={item.path} value={item.label} onSelect={close}>
								{item.label}
							</Command.LinkItem>
						{/each}
					</Command.Group>
				{/if}
			</Command.List>
		</Command.Root>
	</Dialog.Content>
</Dialog.Root>
