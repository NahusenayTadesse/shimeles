<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { ChevronDown, ChevronUp, SquarePlay, Trash } from '@lucide/svelte';
	import { parseYouTubeUrl, youtubeEmbedUrl } from '$lib/youtube';

	/**
	 * The dashboard counterpart to `$lib/content/VideoEmbed` — add, caption,
	 * reorder and remove the YouTube links a post shows.
	 *
	 * Shaped like `GalleryUpload` and taking its action names the same way, so
	 * the next screen that wants videos can point it at its own table.
	 *
	 * A staff member pastes the address from the browser bar. The link is
	 * checked here as they type — a wrong paste should be obvious before they
	 * press Add, not after a reader finds a blank space on the live page — and
	 * again on the server, which is the check that counts.
	 */
	let {
		videos = [],
		addAction = '?/addVideo',
		deleteAction = '?/deleteVideo',
		updateCaptionAction = '?/updateVideoCaption',
		reorderAction = '?/reorderVideos'
	}: {
		videos: { id: number; youtubeUrl: string; caption: string | null }[];
		addAction?: string;
		deleteAction?: string;
		updateCaptionAction?: string;
		reorderAction?: string;
	} = $props();

	let url = $state('');
	let caption = $state('');
	let saving = $state(false);

	const parsed = $derived(parseYouTubeUrl(url));
	const touched = $derived(url.trim().length > 0);

	function move(index: number, delta: number) {
		const next = [...videos];
		const target = index + delta;
		if (target < 0 || target >= next.length) return null;
		[next[index], next[target]] = [next[target], next[index]];
		return next.map((video) => video.id).join(',');
	}
</script>

<div class="flex flex-col gap-4">
	{#if videos.length}
		<div class="grid gap-4 lg:grid-cols-2">
			{#each videos as video, index (video.id)}
				{@const parsedVideo = parseYouTubeUrl(video.youtubeUrl)}
				<div class="flex flex-col gap-2 rounded-lg border p-3">
					{#if parsedVideo}
						<iframe
							src={youtubeEmbedUrl(parsedVideo)}
							title={video.caption || 'Video preview'}
							class="aspect-video w-full rounded-md"
							loading="lazy"
							allowfullscreen
						></iframe>
					{:else}
						<!-- Only reachable for a row saved before this check existed, or
						     edited straight in the database. Says so rather than showing
						     an empty frame nobody can explain. -->
						<p class="rounded-md border border-dashed p-4 text-sm text-destructive">
							This link is not a YouTube address, so nothing will render on the site. Remove it and
							paste the link again.
						</p>
					{/if}

					<p class="truncate text-xs text-muted-foreground" title={video.youtubeUrl}>
						{video.youtubeUrl}
					</p>

					<form
						method="post"
						action={updateCaptionAction}
						use:enhance={() =>
							async ({ update }) => {
								await update({ reset: false });
								toast.success('Caption saved');
							}}
						class="flex gap-2"
					>
						<input type="hidden" name="videoId" value={video.id} />
						<Input
							name="caption"
							placeholder="Caption (optional)"
							value={video.caption ?? ''}
							class="h-8 text-sm"
						/>
						<Button type="submit" size="sm" variant="outline">Save</Button>
					</form>

					<div class="flex items-center justify-between">
						<div class="flex gap-1">
							<form method="post" action={reorderAction} use:enhance>
								<input type="hidden" name="order" value={move(index, -1) ?? ''} />
								<Button
									type="submit"
									variant="ghost"
									size="icon"
									class="size-7"
									disabled={index === 0}
									aria-label="Move earlier"
								>
									<ChevronUp class="size-4" />
								</Button>
							</form>
							<form method="post" action={reorderAction} use:enhance>
								<input type="hidden" name="order" value={move(index, 1) ?? ''} />
								<Button
									type="submit"
									variant="ghost"
									size="icon"
									class="size-7"
									disabled={index === videos.length - 1}
									aria-label="Move later"
								>
									<ChevronDown class="size-4" />
								</Button>
							</form>
						</div>

						<form method="post" action={deleteAction} use:enhance>
							<input type="hidden" name="videoId" value={video.id} />
							<Button type="submit" variant="ghost" size="icon" class="size-7 text-destructive">
								<Trash class="size-4" />
							</Button>
						</form>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">No videos yet.</p>
	{/if}

	<form
		method="post"
		action={addAction}
		use:enhance={() => {
			saving = true;
			return async ({ update, result }) => {
				saving = false;
				await update({ reset: false });
				if (result.type === 'success') {
					url = '';
					caption = '';
					toast.success('Video added');
				}
			};
		}}
		class="flex flex-col gap-3 rounded-xl border border-dashed p-4"
	>
		<div class="flex items-center gap-2">
			<SquarePlay class="size-5 text-muted-foreground" />
			<Label for="video-url" class="font-medium">Add a YouTube video</Label>
		</div>

		<p class="text-sm text-muted-foreground">
			Paste the address from your browser bar, or the link YouTube's Share button gives you. Not the
			embed code.
		</p>

		<div class="flex flex-col gap-2 sm:flex-row">
			<Input
				id="video-url"
				name="youtubeUrl"
				bind:value={url}
				placeholder="https://www.youtube.com/watch?v=…"
				class="flex-1"
				aria-invalid={touched && !parsed}
			/>
			<Input name="caption" bind:value={caption} placeholder="Caption (optional)" class="sm:w-56" />
			<Button type="submit" disabled={saving || !parsed}>
				{saving ? 'Adding…' : 'Add video'}
			</Button>
		</div>

		{#if touched && !parsed}
			<p class="text-sm text-destructive">
				That does not look like a YouTube link. It should look like
				<code>https://www.youtube.com/watch?v=…</code> or <code>https://youtu.be/…</code>.
			</p>
		{:else if parsed}
			<p class="text-sm text-muted-foreground">
				Video <code>{parsed.id}</code>{parsed.start ? `, starting at ${parsed.start}s` : ''}. Ready
				to add.
			</p>
		{/if}
	</form>
</div>
