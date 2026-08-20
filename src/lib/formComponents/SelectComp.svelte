<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';
	import { selectItem, type Item } from '$lib/global.svelte';

	/**
	 * `onValueChange` is optional and additive: the common case still binds
	 * `value` inside a form, but a filter bar needs to act on the change (push
	 * a URL parameter) rather than wait for a submit.
	 */
	let { value = $bindable(), items, name, onValueChange = undefined } = $props();
	// const triggerContent = $derived(
	// 	items.find((f) => f.value === value)?.name ??
	// 		'Select ' + name.replace(/([a-z])([A-Z])/g, '$1 $2')
	// );
	//
	const triggerContent = $derived(
		// Use String coercion to ensure "1" matches 1
		items.find((f: Item) => String(f.value) === String(value))?.name ??
			'Select ' + name.replace(/([a-z])([A-Z])/g, '$1 $2')
	);
</script>

<Select.Root type="single" {name} bind:value {onValueChange}>
	<Select.Trigger class="w-full capitalize">
		{triggerContent}
	</Select.Trigger>
	<Select.Content>
		{#each items as item (item.value)}
			<Select.Item value={item.value} class={selectItem}>{item.name}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
