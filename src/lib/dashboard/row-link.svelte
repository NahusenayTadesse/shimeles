<script lang="ts">
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { ArrowRight } from '@lucide/svelte';

	/** A link cell inside a data table — the "open this row's detail" affordance. */
	let { href, label = 'Open' }: { href: string; label?: string } = $props();
</script>

<a {href} class={buttonVariants({ variant: 'outline', size: 'sm' })}>
	{label}
	<ArrowRight class="size-3.5" />
</a>
