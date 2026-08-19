<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import RichTextEditor from '$lib/formComponents/RichTextEditor.svelte';
	import GalleryUpload from '$lib/components/GalleryUpload.svelte';
	import VideoLinks from '$lib/components/VideoLinks.svelte';
	import { ArrowLeft, ExternalLink } from '@lucide/svelte';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.ok) toast.success('Saved');
	});

	let body = $state(data.post.body ?? '');
	let saving = $state(false);
</script>

<svelte:head><title>{data.post.title} · Blog</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<a
				href="/dashboard/blog"
				class="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline"
			>
				<ArrowLeft class="size-4" /> All posts
			</a>
			<h1 class="font-heading text-2xl font-bold">{data.post.title}</h1>
			<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
				The article itself and the photographs that go with it. The title, cover photo, category and
				publish date are on the <a href="/dashboard/blog" class="underline">post list</a>.
			</p>
		</div>
		{#if data.post.isPublished}
			<a
				href={`/blog/${data.post.slug}`}
				target="_blank"
				class="inline-flex items-center gap-1.5 text-sm underline"
			>
				<ExternalLink class="size-4" /> View post
			</a>
		{/if}
	</div>

	<form
		method="post"
		action="?/saveBody"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update({ reset: false });
			};
		}}
	>
		<Card.Root class="flex flex-col gap-4 p-6">
			<div>
				<h2 class="font-heading text-lg font-semibold">Article</h2>
				<p class="text-sm text-muted-foreground">
					Headings, lists, links and emphasis all render on the live page.
				</p>
			</div>

			<RichTextEditor bind:value={body} placeholder="Write the post…" />
			<input type="hidden" name="body" value={body} />

			<Button type="submit" class="w-fit" disabled={saving}>
				{saving ? 'Saving…' : 'Save article'}
			</Button>
		</Card.Root>
	</form>

	<Separator class="my-2" />

	<Card.Root class="flex flex-col gap-4 p-6">
		<div>
			<h2 class="font-heading text-lg font-semibold">Videos</h2>
			<p class="text-sm text-muted-foreground">
				Shown below the article. Paste a YouTube link and the site builds the player itself.
			</p>
		</div>
		<VideoLinks videos={data.videos} />
	</Card.Root>

	<Separator class="my-2" />

	<Card.Root class="flex flex-col gap-4 p-6">
		<div>
			<h2 class="font-heading text-lg font-semibold">Photo gallery</h2>
			<p class="text-sm text-muted-foreground">
				Shown as a grid below the article, opening onto a full-size lightbox. Reorder them, and give
				any of them a caption.
			</p>
		</div>
		<GalleryUpload images={data.gallery} />
	</Card.Root>
</div>
