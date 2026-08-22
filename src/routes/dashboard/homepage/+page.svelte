<script lang="ts">
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import GalleryUpload from '$lib/components/GalleryUpload.svelte';
	import { ExternalLink } from '@lucide/svelte';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.ok) toast.success('Saved');
	});
</script>

<svelte:head><title>Homepage · Content</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="font-heading text-2xl font-bold">Homepage</h1>
			<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
				The two photo sets on the homepage: the hero collage behind the headline, and the gallery
				section further down the page. The headline, subheadline and buttons are edited under
				<a href="/dashboard/settings" class="underline">Site settings → Homepage</a>. This screen is
				only the photos.
			</p>
		</div>
		<a href="/" target="_blank" class="inline-flex items-center gap-1.5 text-sm underline">
			<ExternalLink class="size-4" /> View homepage
		</a>
	</div>

	<Card.Root class="flex flex-col gap-4 p-6">
		<div>
			<h2 class="font-heading text-lg font-semibold">Hero collage</h2>
			<p class="text-sm text-muted-foreground">
				Add a few photos and the hero rotates through all of them; with none, it falls back to the
				single hero image set in Site settings.
			</p>
		</div>
		<GalleryUpload
			images={data.gallery}
			addAction="?/addGalleryImages"
			deleteAction="?/deleteGalleryImage"
			updateCaptionAction="?/updateGalleryCaption"
			reorderAction="?/reorderGallery"
		/>
	</Card.Root>

	<Separator class="my-2" />

	<Card.Root class="flex flex-col gap-4 p-6">
		<div>
			<h2 class="font-heading text-lg font-semibold">Gallery section</h2>
			<p class="text-sm text-muted-foreground">
				Shown as a photo grid further down the homepage, with a lightbox. Leave it empty and the
				section does not render at all.
			</p>
		</div>
		<GalleryUpload
			images={data.homepageGallery}
			addAction="?/addHomepageGalleryImages"
			deleteAction="?/deleteHomepageGalleryImage"
			updateCaptionAction="?/updateHomepageGalleryCaption"
			reorderAction="?/reorderHomepageGallery"
		/>
	</Card.Root>
</div>
