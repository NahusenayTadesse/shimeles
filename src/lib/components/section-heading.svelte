<script lang="ts">
	import { reveal } from '$lib/actions/reveal';

	let {
		title,
		subtitle,
		eyebrow,
		align = 'start'
	}: {
		title: string;
		subtitle?: string | null;
		/** Small tracked label above the title, e.g. "Our Pillars". */
		eyebrow?: string | null;
		align?: 'center' | 'start';
	} = $props();
</script>

<div class={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
	{#if eyebrow}
		<p use:reveal class="eyebrow mb-3">{eyebrow}</p>
	{/if}
	<h2 use:reveal={{ delay: eyebrow ? 80 : 0 }} class="text-3xl md:text-4xl">{title}</h2>
	{#if subtitle}
		<p use:reveal={{ delay: 120 }} class="mt-4 text-lg text-muted-foreground">
			{subtitle}
		</p>
	{/if}
</div>
