<script lang="ts">
	import { buttonVariants } from '$lib/components/ui/button/index.js';

	/** The trailing "Open" link column, for list pages whose row leads to a detail page. */
	let { href, label = 'Open' }: { href: string; label?: string } = $props();
</script>

<div class="text-right">
	<a {href} class={buttonVariants({ variant: 'outline', size: 'sm' })}>{label}</a>
</div>
