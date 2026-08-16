<script lang="ts">
	let { name, isRead }: { name: string; isRead: boolean } = $props();
</script>

<span class={isRead ? '' : 'font-medium'}>{name || 'Anonymous'}</span>
