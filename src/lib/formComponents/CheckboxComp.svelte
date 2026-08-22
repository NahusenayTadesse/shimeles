<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { type Item } from '$lib/global.svelte';

	/**
	 * "Tick all that apply", for a fixed list of options.
	 *
	 * Two things about this component were wrong, and both were invisible from
	 * the call site because the control looked and behaved correctly on screen.
	 *
	 * **It turned every value into a number.** `handleChange` mapped the
	 * selection through `Number()` on the way out, which is right for a list of
	 * database ids and catastrophic for anything else. The form builder's
	 * options are slugs — `treatment_cost`, `companionship` — so every box an
	 * applicant ticked was stored as `NaN`, and a form asking "what kind of help
	 * do you need?" recorded `NaN,NaN,NaN`. Values are kept as strings now, and
	 * compared as strings, so an id and a slug both survive.
	 *
	 * **It posted one joined string.** The selection used to reach the server as
	 * a single hidden input holding `a,b,c`, which every consumer then had to
	 * split. Now each ticked value gets its own hidden input under the same
	 * name, which is what a group of checkboxes is supposed to post and what
	 * `FormData.getAll()` — and Superforms' array handling — expect. An empty
	 * selection posts nothing at all rather than an empty string, so "left
	 * alone" and "cleared" look the same to the server, which they should.
	 */

	let {
		items = [],
		/** Omit to render no hidden inputs — for a control inside a JSON-posted form. */
		name = undefined,
		checkedValues = $bindable(),
		/**
		 * Off by default. On a dashboard filter "select all" is a convenience; on
		 * a public form asking "what kind of help do you need?" it is an
		 * invitation to tick everything, which helps nobody — least of all the
		 * applicant, whose real need then cannot be read off the answer.
		 */
		showSelectAll = false
	}: {
		items: Item[];
		name?: string;
		checkedValues?: (string | number)[];
		showSelectAll?: boolean;
	} = $props();

	/** Compared as strings throughout, so a numeric id and its posted form match. */
	const selected = $derived((checkedValues ?? []).map(String));

	const handleChange = (value: string, isChecked: boolean) => {
		checkedValues = isChecked
			? [...new Set([...selected, value])]
			: selected.filter((entry) => entry !== value);
	};

	const allSelected = $derived(selected.length === items.length && items.length > 0);
	const someSelected = $derived(selected.length > 0 && !allSelected);

	function toggleSelectAll() {
		checkedValues = allSelected ? [] : items.map((item) => String(item.value));
	}
</script>

{#if showSelectAll && items.length > 1}
	<div class="flex items-center gap-2 pb-1">
		<Label
			for="select-all-{name ?? 'group'}"
			class="flex cursor-pointer items-center gap-2 font-medium"
		>
			<Checkbox
				id="select-all-{name ?? 'group'}"
				checked={allSelected}
				indeterminate={someSelected}
				onCheckedChange={toggleSelectAll}
			/>
			Select All
		</Label>
	</div>
{/if}

<div class="flex flex-row flex-wrap gap-2">
	{#each items as item (item.value)}
		{@const value = String(item.value)}
		{@const id = `${name ?? 'choice'}-${value}`}
		<div class="flex items-center gap-2">
			<!--
				`normal-case` is not decoration. The base `Label` is uppercase, and the
				`peer-data-[slot=checkbox]:normal-case` escape in it only applies to a
				label that *follows* its checkbox. This one wraps the box, so the
				escape never matched and every option shouted: "HELP WITH TREATMENT
				COSTS", "SOMEONE TO BE THERE".
			-->
			<Label for={id} class="cursor-pointer text-sm font-normal tracking-normal normal-case">
				<Checkbox
					{id}
					checked={selected.includes(value)}
					onCheckedChange={(ticked) => handleChange(value, ticked === true)}
				/>
				{item.name}
			</Label>
		</div>
	{/each}
</div>

<!--
	One input per ticked value, all sharing the field's name. This is the shape a
	checkbox group posts natively, and the shape `FormData.getAll()` reads back.
-->
{#if name}
	{#each selected as value (value)}
		<input type="hidden" {name} {value} />
	{/each}
{/if}
