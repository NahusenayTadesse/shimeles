<script lang="ts">
	import { toggleMode, mode } from 'mode-watcher';
	import { Sun, Moon } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
</script>

<Button
	onclick={toggleMode}
	variant="ghost"
	size="icon"
	aria-label="Toggle theme"
	class="text-foreground/80 hover:text-primary"
>
	{#if mode.current === 'dark'}
		<Sun class="size-5" />
	{:else}
		<Moon class="size-5" />
	{/if}
</Button>
