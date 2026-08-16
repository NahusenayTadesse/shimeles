<script lang="ts">
	import PageShell from '$lib/content/PageShell.svelte';

	let { data } = $props();
</script>

<PageShell
	page={data.page}
	pillars={data.pillars}
	initiatives={data.initiatives}
	metrics={data.metrics}
	payments={data.payments}
	settings={data.settings}
	forms={data.forms}
	labels={data.strings}
/>
