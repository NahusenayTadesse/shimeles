<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { ComponentProps } from 'svelte';

	/** A single badge as a table cell — for the many "is this active / verified / diaspora" columns. */
	let {
		label,
		variant = 'outline',
		class: className = ''
	}: {
		label: string;
		variant?: ComponentProps<typeof Badge>['variant'];
		class?: string;
	} = $props();
</script>

<Badge {variant} class={className}>{label}</Badge>
