<script lang="ts">
	let {
		title,
		subtitle,
		align = 'start'
	}: {
		title: string;
		subtitle?: string | null;
		align?: 'center' | 'start';
	} = $props();
</script>

<div class={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
	<h2 class="text-[clamp(2.4rem,1.4rem+3.2vw,5rem)]">{title}</h2>
	{#if subtitle}
		<p class="mt-4 text-lg text-muted-foreground">
			{subtitle}
		</p>
	{/if}
</div>
