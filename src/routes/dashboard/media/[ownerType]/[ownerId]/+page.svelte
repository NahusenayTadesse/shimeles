<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import GalleryUpload from '$lib/components/GalleryUpload.svelte';
	import VideoLinks from '$lib/components/VideoLinks.svelte';
	import { ArrowLeft, ExternalLink } from '@lucide/svelte';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.ok) toast.success('Saved');
	});
</script>

<svelte:head><title>{data.owner.label} · Photos &amp; video</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<a
				href={data.owner.backHref}
				class="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline"
			>
				<ArrowLeft class="size-4" />
				{data.owner.backLabel}
			</a>
			<h1 class="font-heading text-2xl font-bold">{data.owner.label}</h1>
			<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
				Photographs and videos for this item. They render on the public page in the order set here.
			</p>
		</div>
		{#if data.owner.viewHref}
			<a
				href={data.owner.viewHref}
				target="_blank"
				class="inline-flex items-center gap-1.5 text-sm underline"
			>
				<ExternalLink class="size-4" /> View page
			</a>
		{/if}
	</div>

	<Card.Root class="flex flex-col gap-4 p-6">
		<div>
			<h2 class="font-heading text-lg font-semibold">Photo gallery</h2>
			<p class="text-sm text-muted-foreground">
				Shown as a grid that opens onto a full-size lightbox. Reorder them, and give any of them a
				caption.
			</p>
		</div>
		<GalleryUpload images={data.gallery} />
	</Card.Root>

	<Separator class="my-2" />

	<Card.Root class="flex flex-col gap-4 p-6">
		<div>
			<h2 class="font-heading text-lg font-semibold">Videos</h2>
			<p class="text-sm text-muted-foreground">
				Paste a YouTube link and the site builds the player itself.
			</p>
		</div>
		<VideoLinks videos={data.videos} />
	</Card.Root>
</div>
