<script lang="ts">
	import DynamicForm from '$lib/forms/DynamicForm.svelte';
	import TrimBand from '$lib/components/trim-band.svelte';
	import { reveal } from '$lib/actions/reveal';

	let { data } = $props();
</script>

<svelte:head>
	<title
		>{data.definition.title} · {data.settings?.['site.name'] ?? 'Shimeles Abera Foundation'}</title
	>
	<!-- Application forms carry personal circumstances in their URLs' query
	     strings if a visitor shares them; keeping them out of search results is
	     the cautious default for anything beneficiary-facing. -->
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="relative overflow-hidden bg-muted/40">
	<div
		class="pointer-events-none absolute -top-20 right-[-8%] size-72 rounded-full bg-olive/15 blur-3xl"
		aria-hidden="true"
	></div>
	<div class="relative mx-auto w-full max-w-3xl px-4 pt-16 pb-14 md:pt-20">
		<h1 use:reveal class="font-heading text-3xl md:text-4xl">{data.definition.title}</h1>
	</div>
	<TrimBand class="relative w-full" thin />
</div>

<div class="mx-auto w-full max-w-3xl px-4 py-12 md:py-16">
	<div use:reveal={{ delay: 100 }} class="shadow-warm rounded-[2rem] border bg-card p-6 md:p-10">
		<DynamicForm form={data.definition} data={data.form} labels={data.strings ?? {}} />
	</div>
</div>
