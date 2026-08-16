<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import RichTextEditor from '$lib/formComponents/RichTextEditor.svelte';
	import FileUpload from '$lib/formComponents/FileUpload.svelte';
	import GalleryUpload from '$lib/components/GalleryUpload.svelte';
	import { ExternalLink } from '@lucide/svelte';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.ok) toast.success('Saved');
	});

	let storyBody = $state(data.content?.storyBody ?? '');
	let memoriamBody = $state(data.content?.memoriamBody ?? '');

	let saving = $state(false);
</script>

<svelte:head><title>About page · Content</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="font-heading text-2xl font-bold">About page</h1>
			<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
				The story, the mission and vision, and the In Memoriam tribute and gallery — everything on
				<code>/about</code> a program manager might need to rewrite. The layout itself lives in code,
				not here.
			</p>
		</div>
		<a href="/about" target="_blank" class="inline-flex items-center gap-1.5 text-sm underline">
			<ExternalLink class="size-4" /> View page
		</a>
	</div>

	<form
		method="post"
		action="?/saveContent"
		enctype="multipart/form-data"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update({ reset: false });
			};
		}}
		class="flex flex-col gap-6"
	>
		<Card.Root class="flex flex-col gap-4 p-6">
			<h2 class="font-heading text-lg font-semibold">Our Story</h2>

			<div class="flex flex-col gap-2">
				<Label for="metaDescription">Meta description (search &amp; share preview)</Label>
				<Textarea
					id="metaDescription"
					name="metaDescription"
					rows={2}
					value={data.content?.metaDescription ?? ''}
				/>
			</div>

			<FileUpload
				name="heroImage"
				label="Top banner photo"
				image={data.content?.heroImage}
			/>

			<div class="flex flex-col gap-2">
				<Label>Story body</Label>
				<RichTextEditor bind:value={storyBody} />
				<input type="hidden" name="storyBody" value={storyBody} />
			</div>
		</Card.Root>

		<Card.Root class="flex flex-col gap-4 p-6">
			<h2 class="font-heading text-lg font-semibold">Mission &amp; Vision</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="flex flex-col gap-2">
					<Label for="missionText">Our mission</Label>
					<Textarea
						id="missionText"
						name="missionText"
						rows={5}
						value={data.content?.missionText ?? ''}
					/>
				</div>
				<div class="flex flex-col gap-2">
					<Label for="visionText">Our vision</Label>
					<Textarea id="visionText" name="visionText" rows={5} value={data.content?.visionText ?? ''} />
				</div>
			</div>
		</Card.Root>

		<Card.Root class="flex flex-col gap-4 p-6">
			<h2 class="font-heading text-lg font-semibold">In Memoriam</h2>
			<p class="text-sm text-muted-foreground">
				The large tribute photo and text at the bottom of the About page — not the small version on
				the homepage, which is a regular content block (Pages &amp; content → About was, before this
				screen — see Pages &amp; content for other pages).
			</p>

			<div class="flex flex-col gap-2">
				<Label for="memoriamName">Name</Label>
				<Input
					id="memoriamName"
					name="memoriamName"
					value={data.content?.memoriamName ?? 'Shimeles Abera'}
				/>
			</div>

			<FileUpload
				name="memoriamHeroImage"
				label="Primary photo (shown large, not as an avatar)"
				image={data.content?.memoriamHeroImage}
			/>

			<div class="flex flex-col gap-2">
				<Label>Tribute text</Label>
				<RichTextEditor bind:value={memoriamBody} />
				<input type="hidden" name="memoriamBody" value={memoriamBody} />
			</div>
		</Card.Root>

		<Button type="submit" class="w-fit" disabled={saving}>
			{saving ? 'Saving…' : 'Save changes'}
		</Button>
	</form>

	<Separator class="my-2" />

	<Card.Root class="flex flex-col gap-4 p-6">
		<div>
			<h2 class="font-heading text-lg font-semibold">In Memoriam gallery</h2>
			<p class="text-sm text-muted-foreground">
				Shown as a photo grid below the tribute. Add as many as you like, reorder them, and give any
				of them a caption.
			</p>
		</div>
		<GalleryUpload images={data.gallery} />
	</Card.Root>
</div>
