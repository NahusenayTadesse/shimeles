<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { CloudUpload as UploadCloud, FileText, Loader, X } from '@lucide/svelte';
	import { assetUrl } from '$lib/assets';
	import imageCompression from 'browser-image-compression';
	import { IMAGE_COMPRESSION, webpName } from '$lib/forms/uploads';
	import { fileProxy } from 'sveltekit-superforms';

	/**
	 * A single-file dropzone, used two ways:
	 *
	 * - Pass `form` (a Superforms writable) and this also mirrors the
	 *   selection through `fileProxy`, for the generic `crud-dialog` /
	 *   `DynamicForm` screens that validate via a Superforms schema.
	 * - Omit `form` and it only drives its own native `<input>`, for the
	 *   dashboard's plain `use:enhance` forms (About, Site settings, the page
	 *   block editor) — the file rides along as a normal form field.
	 *
	 * Either way, images are compressed client-side (`browser-image-compression`)
	 * before they ever reach the wire, and `image` (the field's currently saved
	 * value, if any) previews until the user picks a replacement. Leaving the
	 * field empty on submit means "keep the current image" — every server
	 * action that consumes one of these already treats a missing file that way,
	 * so there is no separate "remove" affordance.
	 */
	let {
		name,
		form,
		image = null,
		label,
		placeholder = 'Click to upload or drag an image',
		accept = 'image/*',
		required = false
	}: {
		name: string;
		form?: any;
		image?: string | null;
		label?: string;
		placeholder?: string;
		accept?: string;
		required?: boolean;
	} = $props();

	const proxy = form ? fileProxy(form, name) : null;

	let isDragging = $state(false);
	let isProcessing = $state(false);
	let selected: File | null = $state(null);
	let fileInput: HTMLInputElement | undefined = $state();

	function assign(file: File) {
		selected = file;
		const dt = new DataTransfer();
		dt.items.add(file);
		if (fileInput) fileInput.files = dt.files;
		proxy?.set(dt.files);
	}

	async function selectFile(list: FileList | null) {
		const file = list?.[0];
		if (!file) return;
		isProcessing = true;

		try {
			if (file.type.startsWith('image/')) {
				try {
					const compressed = await imageCompression(file, IMAGE_COMPRESSION);
					assign(new File([compressed], webpName(file.name), { type: compressed.type }));
				} catch (err) {
					console.error('Compression error:', err);
					assign(file);
				}
			} else {
				assign(file);
			}
		} finally {
			isProcessing = false;
		}
	}

	function clearSelection() {
		selected = null;
		if (fileInput) fileInput.value = '';
		proxy?.set(undefined as unknown as FileList);
	}
</script>

<div class="flex flex-col gap-2">
	{#if label}
		<Label for={`${name}-input`}>{label}</Label>
	{/if}

	<input
		bind:this={fileInput}
		id={`${name}-input`}
		{name}
		type="file"
		class="hidden"
		{accept}
		{required}
		onchange={(e) => selectFile(e.currentTarget.files)}
	/>

	{#if selected}
		<div class="relative w-fit overflow-hidden rounded-xl border bg-card p-3 shadow-sm">
			<div class="flex items-center gap-3">
				{#if selected.type.startsWith('image/')}
					<img
						src={URL.createObjectURL(selected)}
						alt="New upload preview"
						class="h-20 w-20 rounded-lg border object-cover"
					/>
				{:else}
					<div class="flex h-20 w-20 items-center justify-center rounded-lg border bg-muted">
						<FileText class="size-6 text-muted-foreground" />
					</div>
				{/if}
				<div class="flex flex-col">
					<span class="max-w-48 truncate text-sm font-medium">{selected.name}</span>
					<span class="text-xs text-muted-foreground">{(selected.size / 1024).toFixed(0)} KB</span>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					class="ml-2 size-7 text-destructive"
					onclick={clearSelection}
					aria-label="Remove selection"
				>
					<X class="size-4" />
				</Button>
			</div>
		</div>
	{:else}
		<Label
			for={`${name}-input`}
			class="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-6 transition-all
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
				selectFile(e.dataTransfer?.files ?? null);
			}}
		>
			<div class="flex flex-col items-center justify-center gap-2 text-center">
				<div
					class="rounded-full bg-background p-3 shadow-sm transition-transform group-hover:scale-110"
				>
					{#if isProcessing}
						<Loader class="h-5 w-5 animate-spin text-primary" />
					{:else}
						<UploadCloud class="h-5 w-5 {isDragging ? 'text-primary' : 'text-muted-foreground'}" />
					{/if}
				</div>
				<div class="px-4">
					<p class="text-sm font-medium">
						{isProcessing ? 'Optimizing…' : isDragging ? 'Drop it now!' : placeholder}
					</p>
					{#if image}
						<p class="text-xs text-muted-foreground">Leave empty to keep the current image</p>
					{/if}
				</div>
			</div>
		</Label>

		{#if image}
			<img src={assetUrl(image)} alt="" class="max-h-40 w-fit rounded-lg border object-cover" />
		{/if}
	{/if}
</div>
