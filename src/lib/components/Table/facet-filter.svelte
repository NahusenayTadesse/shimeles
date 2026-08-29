<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Check, ChevronDown, X } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	/**
	 * One column's filter.
	 *
	 * There used to be a single "Filter" button holding every column's values in
	 * one scrolling list. It hid the useful part: you could not see what a table
	 * could be narrowed by without opening it, and once open you scrolled past
	 * three columns' values to reach the fourth.
	 *
	 * A button per column says what you can filter by before you press anything,
	 * and each one carries its own state on its face — "Group: Health", "Licence:
	 * 2" — so a glance at the toolbar tells you what is in force.
	 */
	let {
		label,
		values,
		selected,
		onchange
	}: {
		label: string;
		/** `value` is what the filter compares; `label` is what the column shows. */
		values: { value: string; count: number; label: string }[];
		selected: string[];
		onchange: (next: string[]) => void;
	} = $props();

	const active = $derived(selected.length > 0);

	/**
	 * One selection reads better as itself than as a number: "Group: Health"
	 * needs no opening to understand, where "Group: 1" needs two.
	 */
	const labelOf = (value: string) => values.find((entry) => entry.value === value)?.label ?? value;

	const summary = $derived(
		selected.length === 0
			? ''
			: selected.length === 1
				? labelOf(selected[0])
				: String(selected.length)
	);

	const toggle = (value: string) =>
		onchange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				size="sm"
				class={cn(
					'shrink-0 gap-1.5 border-dashed',
					active && 'border-solid border-primary/50 bg-primary/5'
				)}
			>
				<span class="text-muted-foreground">{label}</span>
				{#if active}
					<span class="max-w-32 truncate font-medium">{summary}</span>
				{/if}
				<ChevronDown class="size-3.5 opacity-50" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="start" class="max-h-80 w-56 overflow-y-auto">
		<DropdownMenu.Label class="text-xs text-muted-foreground">{label}</DropdownMenu.Label>
		{#each values as entry (entry.value)}
			{@const checked = selected.includes(entry.value)}
			<DropdownMenu.Item closeOnSelect={false} onclick={() => toggle(entry.value)}>
				<span
					class={cn(
						'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
						checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
					)}
				>
					{#if checked}<Check class="size-3" />{/if}
				</span>
				<span class="min-w-0 flex-1 truncate capitalize">{entry.label}</span>
				<!-- How many rows are behind this value, so the choice is informed
				     before it is made rather than after. -->
				<span class="text-xs text-muted-foreground tabular-nums">{entry.count}</span>
			</DropdownMenu.Item>
		{/each}

		{#if active}
			<DropdownMenu.Separator />
			<DropdownMenu.Item closeOnSelect={false} onclick={() => onchange([])}>
				<X class="size-4" /> Clear {label.toLowerCase()}
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
