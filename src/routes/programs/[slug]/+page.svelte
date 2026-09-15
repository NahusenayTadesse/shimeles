<script lang="ts">
	import PageHero from '$lib/content/PageHero.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import DynamicForm from '$lib/forms/DynamicForm.svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import Gallery from '$lib/components/Gallery.svelte';
	import VideoCarousel from '$lib/content/VideoCarousel.svelte';
	import SectionHeading from '$lib/components/section-heading.svelte';

	let { data } = $props();

	const pillar = $derived(data.pillar);

	/** One trail for `<Seo>` and for the visible breadcrumbs, so they cannot disagree. */
	const trail = $derived([
		{ name: 'Home', path: '/' },
		{ name: 'Programs', path: '/programs' },
		{ name: pillar.name, path: `/programs/${pillar.slug}` }
	]);
</script>

<Seo
	title={pillar.name}
	description={pillar.summary}
	image={pillar.image}
	imageAlt={pillar.name}
	breadcrumbs={trail}
/>

<PageHero
	breadcrumbs={trail}
	breadcrumbLabel={data.strings?.['nav.breadcrumb_label']}
	eyebrow="One of four programmes"
	title={pillar.name}
	description={pillar.summary}
	image={pillar.image}
	imageAlt={pillar.name}
>
	{#snippet actions()}
		{#if data.applicationForm}
			<a href="#apply" class={buttonVariants({ size: 'lg' })}> Apply for support </a>
		{/if}
		<a
			href={`/donate?pillar=${pillar.slug}`}
			class={buttonVariants({ variant: 'outline', size: 'lg' })}
		>
			Give to this programme
		</a>
	{/snippet}
</PageHero>

{#if pillar.description}
	<div class="mx-auto w-full max-w-6xl px-4 pt-16 md:pt-24">
		<!-- Authored in the dashboard's rich-text editor, per §3.2. -->
		<div class="prose-block prose-lede max-w-prose">
			{@html pillar.description}
		</div>
	</div>
{/if}

{#if data.media.videos.length}
	<div class="mx-auto w-full max-w-4xl px-4 pt-16 md:pt-24">
		<SectionHeading title="Watch" />
		<div class="mt-8">
			<VideoCarousel videos={data.media.videos} title={pillar.name} />
		</div>
	</div>
{/if}

{#if data.media.gallery.length}
	<div class="mx-auto w-full max-w-6xl px-4 pt-16 md:pt-24">
		<SectionHeading title="From this programme" />
		<div class="mt-8">
			<Gallery images={data.media.gallery} />
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
		</div>
		<div class="shadow-warm rounded-[2rem] border bg-card p-6 md:p-10">
			<DynamicForm
				form={data.applicationForm.definition}
				data={data.applicationForm.data}
				action={`?/submit&slug=${data.applicationForm.slug}`}
				labels={data.strings ?? {}}
			/>
		</div>
	</div>
{/if}
