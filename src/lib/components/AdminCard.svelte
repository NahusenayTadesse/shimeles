<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import { ArrowRight } from '@lucide/svelte';

	/** A grouped set of admin links, shown as one card on the admin panel index. */
	let {
		title,
		description = '',
		icon = 'Users',
		items = [],
		accentColor = 'from-primary/15 to-primary/5'
	}: {
		title: string;
		description?: string;
		icon?: string;
		items?: { name: string; href: string }[];
		accentColor?: string;
	} = $props();
</script>

<Card.Root class="overflow-hidden">
	<div class="bg-linear-to-br {accentColor} px-6 py-5">
		<DynamicIcon name={icon} class="size-8 text-primary" />
		<h3 class="mt-3 font-heading text-xl font-semibold">{title}</h3>
		{#if description}
			<p class="mt-1 text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>
	<Card.Content class="flex flex-col gap-2 pt-4">
		{#each items as item (item.href)}
			<Button href={item.href} variant="ghost" class="justify-between">
				{item.name}
				<ArrowRight class="size-4" />
			</Button>
		{/each}
	</Card.Content>
</Card.Root>
