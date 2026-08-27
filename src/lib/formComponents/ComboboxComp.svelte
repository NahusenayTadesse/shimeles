<script lang="ts">
	import SelectComp from './SelectComp.svelte';
	import type { Item } from '$lib/global.svelte';

	/**
	 * Kept as a name — a form field of type `combo` still asks for this — but
	 * every select is a combobox now, so this is `SelectComp` with the search
	 * box pinned on.
	 */
	let {
		items,
		name,
		value = $bindable(),
		required = false
	}: {
		items: Item[];
		name: string;
		value: string | number | undefined;
		required?: boolean;
	} = $props();
</script>

<SelectComp {items} {name} {required} bind:value searchable />
