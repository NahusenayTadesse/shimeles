<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';
	import { selectItem, type Item } from '$lib/global.svelte';

	let { value = $bindable(), items, name } = $props();
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

<Select.Root type="single" {name} bind:value>
	<Select.Trigger class="w-full capitalize">
		{triggerContent}
	</Select.Trigger>
	<Select.Content>
		{#each items as item (item.value)}
			<Select.Item value={item.value} class={selectItem}>{item.name}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
