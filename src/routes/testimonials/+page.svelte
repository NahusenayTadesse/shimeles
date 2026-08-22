<script lang="ts">
	import PageHero from '$lib/content/PageHero.svelte';
	import TestimonialCard from '$lib/content/TestimonialCard.svelte';
	import { reveal } from '$lib/actions/reveal';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { HeartHandshake } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let { data } = $props();

	let filter = $state('');

	const shown = $derived(
		filter ? data.testimonials.filter((t) => t.pillar?.slug === filter) : data.testimonials
	);

	const siteName = $derived(data.settings?.['site.name'] || 'Shimeles Abera Foundation');
</script>

<svelte:head>
	<title>What people say · {siteName}</title>
	<meta
		name="description"
		content="In their own words: the families, elders, students and volunteers the Foundation works alongside."
	/>
</svelte:head>

<PageHero
	eyebrow="In their own words"
	title="What people say"
	description="The families, elders, students and volunteers we work alongside, in their own words."
/>

<div class="mx-auto w-full max-w-6xl px-4 py-16 md:py-24">
	{#if data.pillars.length > 1}
		<div use:reveal class="mb-10 flex flex-wrap items-center gap-2">
			<Button
				variant={filter === '' ? 'default' : 'outline'}
				size="sm"
				class="rounded-full"
				onclick={() => (filter = '')}
			>
				Everyone
			</Button>
			{#each data.pillars as pillar (pillar.id)}
				<Button
					variant={filter === pillar.slug ? 'default' : 'outline'}
					size="sm"
					class="rounded-full"
					onclick={() => (filter = filter === pillar.slug ? '' : pillar.slug)}
				>
					{pillar.name}
				</Button>
			{/each}
		</div>
	{/if}

	{#if shown.length}
		<div class={cn('grid gap-6 sm:grid-cols-2 lg:grid-cols-3')}>
			{#each shown as testimonial, index (testimonial.id)}
				<TestimonialCard {testimonial} {index} />
			{/each}
		</div>
	{:else}
		<div use:reveal class="rounded-[2rem] border border-dashed p-12 text-center">
			<p class="text-lg font-medium">Nothing here yet.</p>
			<p class="mt-2 text-muted-foreground">
				{#if filter}
					No quotes from this programme yet.
				{:else}
					We are collecting these. Please check back soon.
				{/if}
			</p>
		</div>
	{/if}

	<div class="mt-16 flex flex-wrap items-center justify-center gap-3 border-t pt-10">
		<a href="/donate" class={buttonVariants()}>
			<HeartHandshake class="size-4" /> Support this work
		</a>
		<a href="/volunteer" class={buttonVariants({ variant: 'outline' })}>Volunteer with us</a>
	</div>
</div>
