<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { tick } from 'svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { cn } from '$lib/utils.js';
	import { selectItem, type Item } from '$lib/global.svelte';

	/**
	 * Every dropdown in the app, drawn as a combobox: a trigger, a search box
	 * and a list that scrolls instead of running off the screen.
	 *
	 * It used to be a plain `Select`, which meant a caseworker assigning a
	 * reviewer, or an applicant picking a region, had to scroll a list of
	 * dozens by eye — and, because the select popup carried no maximum height,
	 * that list could grow taller than the viewport. Typing to filter is the
	 * whole point, so the search box is on by default; a two-option field can
	 * pass `searchable={false}`.
	 *
	 * `onValueChange` is optional and additive: the common case still binds
	 * `value` inside a form, but a filter bar needs to act on the change (push
	 * a URL parameter) rather than wait for a submit.
	 */
	let {
		value = $bindable(),
		items,
		name,
		id = undefined,
		onValueChange = undefined,
		/**
		 * What the trigger says before a choice is made.
		 *
		 * Without one it falls back to "Select " plus the field's *name*, which is
		 * fine for the dashboard's `gender` and `status` but not for a form
		 * builder: a public applicant was shown "Select Referred_by", the raw
		 * column key, on a question staff had labelled "Who told you about us?".
		 */
		placeholder = '',
		/**
		 * `capitalize` suits the dashboard, whose options are raw values like
		 * `male` or `in_progress`. A form builder's options carry staff-written
		 * labels, and capitalising those turns "A friend or neighbour" into "A
		 * Friend Or Neighbour", so public forms pass `normal-case`.
		 */
		triggerClass = 'capitalize',
		/** Posted with the form; a hidden input carries the value. */
		required = false,
		disabled = false,
		/** Off for a handful of options, where a search box is only noise. */
		searchable = true
	}: {
		value?: string | number | undefined;
		items: Item[];
		name: string;
		id?: string;
		onValueChange?: (value: string) => void;
		placeholder?: string;
		triggerClass?: string;
		required?: boolean;
		disabled?: boolean;
		searchable?: boolean;
	} = $props();

	let open = $state(false);
	let triggerRef = $state<HTMLButtonElement>(null!);

	/** Use String coercion so "1" matches 1. */
	const selected = $derived(items.find((f: Item) => String(f.value) === String(value)));
	const fallback = $derived(placeholder || 'Select ' + name.replace(/([a-z])([A-Z])/g, '$1 $2'));
	const triggerContent = $derived(selected?.name ?? fallback);

	/** "assignedToId" reads as "Assigned To Id" in the search box's placeholder. */
	const spacedName = $derived(
		name
			.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
			.replace(/[_-]+/g, ' ')
			.trim()
	);

	/**
	 * Refocus the trigger after a choice so the keyboard can carry on through
	 * the rest of the form.
	 */
	function choose(item: Item) {
		value = item.value;
		onValueChange?.(String(item.value));
		open = false;
		tick().then(() => triggerRef?.focus());
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		bind:ref={triggerRef}
		{id}
		{disabled}
		type="button"
		role="combobox"
		aria-expanded={open}
		data-slot="select-trigger"
		data-placeholder={selected ? undefined : ''}
		class={cn(
			// Matched to `select-trigger` so a combobox and a date picker still
			// look like the same underlined field side by side.
			'flex h-10 w-full items-center justify-between gap-1.5 border border-transparent border-b-input bg-transparent px-0 py-2 text-left text-sm transition-[color,border-color] outline-none focus-visible:border-b-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-b-destructive',
			!selected && 'text-muted-foreground',
			triggerClass
		)}
	>
		<span class="line-clamp-1">{triggerContent}</span>
		<ChevronDownIcon class="pointer-events-none size-3.5 shrink-0 text-muted-foreground" />
	</Popover.Trigger>

	<!-- The value is posted by a hidden input rather than by the select itself,
	     which no longer exists. Hidden inputs are barred from constraint
	     validation, so `required` here is for the server's benefit only. -->
	<input type="hidden" {name} {required} value={value ?? ''} />

	<Popover.Content
		class="w-(--bits-floating-anchor-width) min-w-52 p-0"
		align="start"
		sideOffset={4}
	>
		<Command.Root>
			{#if searchable}
				<Command.Input placeholder="Search {spacedName}..." />
			{/if}
			<Command.List class="max-h-64 overscroll-contain">
				<Command.Empty>No {spacedName} found.</Command.Empty>
				<Command.Group>
					{#each items as item (item.value)}
						<Command.Item
							value={String(item.value)}
							keywords={[item.name]}
							disabled={item.disabled}
							onSelect={() => choose(item)}
							class={cn(selectItem, triggerClass)}
						>
							<CheckIcon
								class={cn(
									'size-4 shrink-0',
									String(item.value) === String(value) ? 'opacity-100' : 'text-transparent'
								)}
							/>
							{item.name}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
