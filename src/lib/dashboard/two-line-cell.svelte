<script lang="ts">
	/** A primary line with a muted secondary line beneath — donor/name + contact, reference + tag, etc. */
	let {
		primary,
		secondary
	}: {
		primary: string;
		secondary?: string | null;
	} = $props();
</script>

<div>
	<p class="font-medium">{primary}</p>
	{#if secondary}
		<p class="text-xs text-muted-foreground">{secondary}</p>
	{/if}
</div>
