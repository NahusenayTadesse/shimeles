<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { assetUrl } from '$lib/assets';
	import {
		ChevronDown,
		ChevronUp,
		Trash,
		X,
		CloudUpload as UploadCloud,
		Loader
	} from '@lucide/svelte';
	import { fade } from 'svelte/transition';
	import imageCompression from 'browser-image-compression';

	/**
	 * The dashboard counterpart to `$lib/components/Gallery` — add, caption,
	 * reorder and remove the images a public gallery renders. Not written
	 * specifically for the In Memoriam gallery: it takes the action names as
	 * props precisely so the next dashboard screen that needs a photo gallery
	 * (a pillar, an initiative) can point it at its own table's actions.
	 *
	 * New photos are compressed client-side (`browser-image-compression`)
	 * before they ever hit the wire — a phone photo at 4-8MB becomes ~1MB,
	 * which matters on the connections this dashboard actually gets used over.
	 */
	let {
		images = [],
		addAction = '?/addGalleryImages',
		deleteAction = '?/deleteGalleryImage',
		updateCaptionAction = '?/updateGalleryCaption',
		reorderAction = '?/reorderGallery'
	}: {
		images: { id: number; storagePath: string; caption: string | null }[];
		addAction?: string;
		deleteAction?: string;
		updateCaptionAction?: string;
		reorderAction?: string;
	} = $props();

	let uploading = $state(false);
	let isDragging = $state(false);
	let isProcessing = $state(false);
	let pending: File[] = $state([]);
	let fileInput: HTMLInputElement | undefined = $state();

	function move(index: number, delta: number) {
		const next = [...images];
		const target = index + delta;
		if (target < 0 || target >= next.length) return null;
		[next[index], next[target]] = [next[target], next[index]];
		return next.map((image) => image.id).join(',');
	}

	/** Mirrors `pending` onto the real input's FileList so the form submits it. */
	function syncInput() {
		if (!fileInput) return;
		const dt = new DataTransfer();
		pending.forEach((f) => dt.items.add(f));
		fileInput.files = dt.files;
	}

	async function addFiles(list: FileList | null) {
		if (!list || list.length === 0) return;
		isProcessing = true;

		const options = {
			maxSizeMB: 1,
			maxWidthOrHeight: 1920,
			useWebWorker: true,
			initialQuality: 0.8
		};

		try {
			const processed = await Promise.all(
				Array.from(list).map(async (f) => {
					if (!f.type.startsWith('image/')) return f;
					try {
						const compressed = await imageCompression(f, options);
						return new File([compressed], f.name, { type: compressed.type });
					} catch (err) {
						console.error('Compression error:', err);
						return f;
					}
				})
			);
			pending = [...pending, ...processed];
			syncInput();
		} catch (err) {
			console.error('Selection error:', err);
			toast.error('Failed to process photos');
		} finally {
			isProcessing = false;
		}
	}

	function removePending(index: number) {
		pending = pending.filter((_, i) => i !== index);
		syncInput();
	}
</script>

<div class="flex flex-col gap-4">
	{#if images.length}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each images as image, index (image.id)}
				<div class="flex flex-col gap-2 rounded-lg border p-3">
					<img
						src={assetUrl(image.storagePath)}
						alt={image.caption ?? ''}
						class="aspect-video w-full rounded-md object-cover"
					/>

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
						<input type="hidden" name="imageId" value={image.id} />
						<Input
							name="caption"
							placeholder="Caption (optional)"
							value={image.caption ?? ''}
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
									disabled={index === images.length - 1}
									aria-label="Move later"
								>
									<ChevronDown class="size-4" />
								</Button>
							</form>
						</div>

						<form method="post" action={deleteAction} use:enhance>
							<input type="hidden" name="imageId" value={image.id} />
							<Button type="submit" variant="ghost" size="icon" class="size-7 text-destructive">
								<Trash class="size-4" />
							</Button>
						</form>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">No photos yet.</p>
	{/if}

	<form
		method="post"
		action={addAction}
		enctype="multipart/form-data"
		use:enhance={() => {
			uploading = true;
			return async ({ update, result }) => {
				uploading = false;
				await update({ reset: true });
				if (result.type === 'success') {
					toast.success('Photos added');
					pending = [];
				}
			};
		}}
		class="flex flex-col gap-4"
	>
		<Label
			for="gallery-upload-input"
			class="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 transition-all
			{isDragging
				? 'border-primary bg-primary/5'
				: 'border-muted-foreground/25 bg-muted/50 hover:border-primary/50 hover:bg-muted'}"
			ondragover={(e) => {
				e.preventDefault();
				isDragging = true;
			}}
			ondragleave={() => (isDragging = false)}
			ondrop={(e) => {
				e.preventDefault();
				isDragging = false;
				addFiles(e.dataTransfer?.files ?? null);
			}}
		>
			<div class="flex flex-col items-center justify-center gap-3 text-center">
				<div
					class="rounded-full bg-background p-4 shadow-sm transition-transform group-hover:scale-110"
				>
					{#if isProcessing}
						<Loader class="h-6 w-6 animate-spin text-primary" />
					{:else}
						<UploadCloud class="h-6 w-6 {isDragging ? 'text-primary' : 'text-muted-foreground'}" />
					{/if}
				</div>
				<div class="px-4">
					<p class="text-sm font-medium">
						{isProcessing
							? 'Optimizing photos…'
							: isDragging
								? 'Drop them now!'
								: 'Click to upload or drag photos'}
					</p>
					<p class="text-xs text-muted-foreground">Images only, optimized automatically</p>
				</div>
			</div>

			<input
				bind:this={fileInput}
				id="gallery-upload-input"
				name="images"
				type="file"
				class="hidden"
				accept="image/*"
				multiple
				onchange={(e) => addFiles(e.currentTarget.files)}
			/>
		</Label>

		{#if pending.length > 0}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
				{#each pending as file, i (file.name + i)}
					<div
						class="group relative aspect-square overflow-hidden rounded-lg border bg-card shadow-sm"
						transition:fade
					>
						<img
							src={URL.createObjectURL(file)}
							class="h-full w-full object-cover"
							alt="New upload preview"
						/>
						<div
							class="absolute inset-0 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
						>
							<Button
								type="button"
								variant="destructive"
								size="icon"
								class="absolute top-1 right-1 h-7 w-7 rounded-full"
								onclick={() => removePending(i)}
							>
								<X class="h-4 w-4" />
							</Button>
						</div>
						<div class="absolute right-0 bottom-0 left-0 bg-primary/90 p-1 text-center text-white">
							<span class="text-[10px] font-bold">{(file.size / 1024).toFixed(0)} KB</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<Button type="submit" size="sm" disabled={uploading || pending.length === 0} class="w-fit">
			<UploadCloud class="size-4" />
			{uploading
				? 'Uploading…'
				: `Add ${pending.length || ''} photo${pending.length === 1 ? '' : 's'}`}
		</Button>
	</form>
</div>
