<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import PageHero from '$lib/content/PageHero.svelte';
	import DynamicForm from '$lib/forms/DynamicForm.svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import { ArrowRight, HeartHandshake } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let { data } = $props();

	const pillar = $derived(data.pillar);

	const accent = $derived(
		{
			clay: 'text-clay bg-clay/10 border-clay/25',
			olive: 'text-olive-bright bg-olive/10 border-olive/30',
			plum: 'text-plum bg-plum/10 border-plum/25',
			sky: 'text-sky bg-sky/10 border-sky/25'
		}[pillar.color] ?? 'text-primary bg-primary/10 border-primary/25'
	);
</script>

<svelte:head>
	<title>{pillar.name} · {data.settings?.['site.name'] ?? 'Shimeles Abera Foundation'}</title>
	{#if pillar.summary}<meta name="description" content={pillar.summary} />{/if}
</svelte:head>

<PageHero eyebrow="One of four programmes" title={pillar.name} description={pillar.summary} image={pillar.image} imageAlt={pillar.name}>
	{#snippet icon()}
		<div class={cn('w-fit rounded-2xl border p-4', accent)}>
			<DynamicIcon name={pillar.icon} class="size-8" />
		</div>
	{/snippet}
	{#snippet actions()}
		{#if data.applicationForm}
			<a href="#apply" class={buttonVariants({ size: 'lg' })}>
				Apply for support
				<ArrowRight class="size-4" />
			</a>
		{/if}
		<a
			href={`/donate?pillar=${pillar.slug}`}
			class={buttonVariants({ variant: 'outline', size: 'lg' })}
		>
			<HeartHandshake class="size-4" />
			Give to this programme
		</a>
	{/snippet}
</PageHero>

{#if pillar.description}
	<div class="mx-auto w-full max-w-6xl px-4 pt-16 md:pt-24">
		<!-- Authored in the dashboard's rich-text editor, per §3.2. -->
		<div use:reveal class="prose-block prose-lede max-w-prose">
			{@html pillar.description}
		</div>
	</div>
{/if}

{#if data.applicationForm}
	<!-- The form renders right here rather than sending an applicant to
	     `/forms/[slug]` — that route still exists for shared links, but the
	     "Apply for support" button above just scrolls down to this. -->
	<div id="apply" class="mx-auto w-full max-w-2xl scroll-mt-20 px-4 py-16 md:py-24">
		<div class="mb-8 flex flex-col gap-2">
			<h2 class="text-3xl md:text-4xl">Apply for support</h2>
			<span class="h-[3px] w-14 rounded-full bg-olive"></span>
		</div>
		<div use:reveal class="rounded-[2rem] border bg-card p-6 shadow-warm md:p-10">
			<DynamicForm
				form={data.applicationForm.definition}
				data={data.applicationForm.data}
				action={`?/submit&slug=${data.applicationForm.slug}`}
				labels={data.strings ?? {}}
			/>
		</div>
	</div>
{/if}
