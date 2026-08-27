<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import RichTextEditor from '$lib/formComponents/RichTextEditor.svelte';
	import FileUpload from '$lib/formComponents/FileUpload.svelte';
	import { yesNo } from '$lib/dashboard/options';
	import {
		ArrowLeft,
		ChevronDown,
		ChevronUp,
		ExternalLink,
		EyeOff,
		Plus,
		SquarePen,
		Trash,
		Trash2
	} from '@lucide/svelte';
	import { METRIC_LABELS, isMetricKey, isMoneyMetric, type MetricKey } from '$lib/metrics';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.ok) toast.success('Saved');
	});

	const blockTypes = [
		{ value: 'rich_text', name: 'Text' },
		{ value: 'image', name: 'Image' },
		{ value: 'quote', name: 'Quote' },
		{ value: 'cta_button', name: 'Button' },
		{ value: 'stat_counter', name: 'Impact counters' },
		{ value: 'values_list', name: 'Values list' },
		{ value: 'pillar_grid', name: 'Pillar grid' },
		{ value: 'initiative_grid', name: 'Future initiatives grid' },
		{ value: 'form_embed', name: 'Link to a form' },
		{ value: 'donation_details', name: 'Bank details' },
		{ value: 'memoriam', name: 'In Memoriam' }
	];

	/** Block types that pull everything from their own tables. */
	const AUTOMATIC = ['pillar_grid', 'initiative_grid', 'donation_details'];

	let editing = $state<number | 'new' | null>(null);
	/** Tracked separately so the dialog can swap its fields as the type changes. */
	let blockType = $state('rich_text');
	let richText = $state('');

	const editingBlock = $derived(
		typeof editing === 'number' ? data.blocks.find((block) => block.id === editing) : null
	);

	/** The counters being edited, as rows rather than as JSON text. */
	let stats = $state<{ metric: string; label: string; suffix: string }[]>([]);

	const metricItems = Object.entries(METRIC_LABELS).map(([value, name]) => ({ value, name }));

	function statsOf(block: (typeof data.blocks)[number] | null | undefined) {
		const value = (block?.content as Record<string, unknown>)?.stats;
		if (!Array.isArray(value)) return [];
		return value.map((entry: Record<string, unknown>) => ({
			metric: isMetricKey(entry?.metric) ? entry.metric : 'families_supported',
			label: typeof entry?.label === 'string' ? entry.label : '',
			suffix: typeof entry?.suffix === 'string' ? entry.suffix : ''
		}));
	}

	$effect(() => {
		if (editing === 'new') {
			blockType = 'rich_text';
			richText = '';
			stats = [];
		} else if (editingBlock) {
			blockType = editingBlock.blockType;
			richText = String((editingBlock.content as Record<string, unknown>)?.body ?? '');
			stats = statsOf(editingBlock);
		}
	});

	const content = (block: (typeof data.blocks)[number], key: string): string => {
		const value = (block.content as Record<string, unknown>)?.[key];
		return typeof value === 'string' ? value : '';
	};

	const jsonOf = (block: (typeof data.blocks)[number] | null | undefined, key: string): string => {
		const value = (block?.content as Record<string, unknown>)?.[key];
		return Array.isArray(value) ? JSON.stringify(value, null, 2) : '';
	};

	/** A one-line summary of what a block actually contains, for the list. */
	function summarise(block: (typeof data.blocks)[number]): string {
		switch (block.blockType) {
			case 'rich_text':
				return (
					content(block, 'body')
						.replace(/<[^>]+>/g, ' ')
						.trim()
						.slice(0, 120) || 'Empty'
				);
			case 'image':
				return content(block, 'alt') || content(block, 'src') || 'No image';
			case 'quote':
				return content(block, 'text').slice(0, 120);
			case 'cta_button':
				return `${content(block, 'label')} → ${content(block, 'url')}`;
			case 'form_embed':
				return `Links to the "${content(block, 'slug')}" form`;
			case 'pillar_grid':
				return 'Renders every active pillar';
			case 'initiative_grid':
				return 'Renders every future initiative';
			case 'donation_details':
				return 'Renders the payment accounts';
			case 'stat_counter':
				return `${((block.content as any)?.stats ?? []).length} counters`;
			case 'values_list':
				return `${((block.content as any)?.values ?? []).length} values`;
			case 'memoriam':
				return content(block, 'name') || 'In Memoriam';
			default:
				return '';
		}
	}

	function move(index: number, delta: number) {
		const next = [...data.blocks];
		const target = index + delta;
		if (target < 0 || target >= next.length) return null;
		[next[index], next[target]] = [next[target], next[index]];
		return next.map((block) => block.id).join(',');
	}

	const publicHref = $derived(data.page.slug === 'home' ? '/' : `/${data.page.slug}`);
</script>

<svelte:head><title>{data.page.title} · Content</title></svelte:head>

<div class="flex flex-col gap-4">
	<a
		href="/dashboard/pages"
		class={buttonVariants({ variant: 'ghost', size: 'sm', class: 'w-fit' })}
	>
		<ArrowLeft class="size-4" /> Back to pages
	</a>

	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="font-heading text-2xl font-bold">{data.page.title}</h1>
			<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
				The body of this page, as blocks in the order they appear. Nothing here lives in the code,
				rewrite a paragraph, drop a section, reorder the lot.
			</p>
		</div>
		<div class="flex gap-2">
			<a
				href={publicHref}
				target="_blank"
				class={buttonVariants({ variant: 'outline', size: 'sm' })}
			>
				<ExternalLink class="size-4" /> View page
			</a>
			<Button size="sm" onclick={() => (editing = 'new')}>
				<Plus class="size-4" /> Add block
			</Button>
		</div>
	</div>

	<div class="flex flex-col gap-2">
		{#each data.blocks as block, index (block.id)}
			<Card.Root class="flex items-start gap-3 p-4">
				<div class="flex flex-col">
					<form method="post" action="?/reorder" use:enhance>
						<input type="hidden" name="order" value={move(index, -1) ?? ''} />
						<Button
							type="submit"
							variant="ghost"
							size="icon"
							class="size-7"
							disabled={index === 0}
							aria-label="Move up"
						>
							<ChevronUp class="size-4" />
						</Button>
					</form>
					<form method="post" action="?/reorder" use:enhance>
						<input type="hidden" name="order" value={move(index, 1) ?? ''} />
						<Button
							type="submit"
							variant="ghost"
							size="icon"
							class="size-7"
							disabled={index === data.blocks.length - 1}
							aria-label="Move down"
						>
							<ChevronDown class="size-4" />
						</Button>
					</form>
				</div>

				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-2">
						<Badge variant="secondary">
							{blockTypes.find((t) => t.value === block.blockType)?.name ?? block.blockType}
						</Badge>
						{#if block.heading}
							<span class="font-medium">{block.heading}</span>
						{/if}
						{#if !block.isPublished}
							<Badge variant="outline" class="gap-1">
								<EyeOff class="size-3" /> Hidden
							</Badge>
						{/if}
					</div>
					<p class="mt-1 line-clamp-2 text-sm text-muted-foreground">{summarise(block)}</p>
				</div>

				<div class="flex gap-1">
					<Button variant="ghost" size="icon" class="size-8" onclick={() => (editing = block.id)}>
						<SquarePen class="size-4" />
					</Button>
					<form method="post" action="?/deleteBlock" use:enhance>
						<input type="hidden" name="blockId" value={block.id} />
						<Button type="submit" variant="ghost" size="icon" class="size-8 text-destructive">
							<Trash class="size-4" />
						</Button>
					</form>
				</div>
			</Card.Root>
		{:else}
			<Card.Root class="p-10 text-center">
				<p class="text-muted-foreground">
					This page has no content yet. Add a block to put something on it.
				</p>
			</Card.Root>
		{/each}
	</div>
</div>

<Dialog.Root open={editing !== null} onOpenChange={(open) => !open && (editing = null)}>
	<Dialog.Content class="max-w-2xl">
		<Dialog.Header>
			<Dialog.Title>{editing === 'new' ? 'Add a block' : 'Edit block'}</Dialog.Title>
		</Dialog.Header>

		<ScrollArea class="max-h-[70vh] pr-3">
			<form
				method="post"
				action={editing === 'new' ? '?/addBlock' : '?/updateBlock'}
				enctype="multipart/form-data"
				use:enhance={() =>
					async ({ update, result }) => {
						await update({ reset: false });
						if (result.type === 'success') editing = null;
					}}
				class="flex flex-col gap-4 p-1"
			>
				{#if editingBlock}
					<input type="hidden" name="blockId" value={editingBlock.id} />
				{/if}

				<div class="flex flex-col gap-2">
					<Label>Type of block</Label>
					<SelectComp name="blockType" items={blockTypes} bind:value={blockType} />
					{#if AUTOMATIC.includes(blockType)}
						<p class="text-xs text-muted-foreground">
							This block draws its content from the relevant table automatically, so there is
							nothing to write here. Adding a pillar or a payment account updates it.
						</p>
					{/if}
				</div>

				<div class="flex flex-col gap-2">
					<Label for="heading">Heading above the block</Label>
					<Input id="heading" name="heading" value={editingBlock?.heading ?? ''} />
				</div>

				<Separator />

				{#if blockType === 'rich_text'}
					<div class="flex flex-col gap-2">
						<Label>Body</Label>
						<RichTextEditor bind:value={richText} />
						<input type="hidden" name="body" value={richText} />
					</div>
				{:else if blockType === 'image'}
					<FileUpload
						name="image"
						label="Image"
						image={editingBlock ? content(editingBlock, 'src') : null}
					/>
					<div class="flex flex-col gap-2">
						<Label for="alt">Alt text</Label>
						<Input
							id="alt"
							name="alt"
							value={content(editingBlock ?? ({ content: {} } as never), 'alt')}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<Label for="caption">Caption</Label>
						<Input
							id="caption"
							name="caption"
							value={content(editingBlock ?? ({ content: {} } as never), 'caption')}
						/>
					</div>
				{:else if blockType === 'quote'}
					<div class="flex flex-col gap-2">
						<Label for="text">Quote</Label>
						<Textarea
							id="text"
							name="text"
							rows={3}
							value={content(editingBlock ?? ({ content: {} } as never), 'text')}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<Label for="attribution">Who said it</Label>
						<Input
							id="attribution"
							name="attribution"
							value={content(editingBlock ?? ({ content: {} } as never), 'attribution')}
						/>
					</div>
				{:else if blockType === 'cta_button'}
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="flex flex-col gap-2">
							<Label for="label">Button text</Label>
							<Input
								id="label"
								name="label"
								value={content(editingBlock ?? ({ content: {} } as never), 'label')}
							/>
						</div>
						<div class="flex flex-col gap-2">
							<Label for="url">Where it goes</Label>
							<Input
								id="url"
								name="url"
								placeholder="/donate"
								value={content(editingBlock ?? ({ content: {} } as never), 'url')}
							/>
						</div>
					</div>
					<div class="flex flex-col gap-2">
						<Label for="note">Small note under the button</Label>
						<Input
							id="note"
							name="note"
							value={content(editingBlock ?? ({ content: {} } as never), 'note')}
						/>
					</div>
				{:else if blockType === 'form_embed'}
					<div class="flex flex-col gap-2">
						<Label for="slug">Form slug</Label>
						<Input
							id="slug"
							name="slug"
							placeholder="contact-form"
							value={content(editingBlock ?? ({ content: {} } as never), 'slug')}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<Label for="label">Text above the link</Label>
						<Input
							id="label"
							name="label"
							value={content(editingBlock ?? ({ content: {} } as never), 'label')}
						/>
					</div>
				{:else if blockType === 'stat_counter'}
					<!-- A repeater, not a JSON textarea.

					     Asking a comms person to type `"is_money": true` into raw JSON
					     put a hundredfold overstatement of funds raised one forgotten
					     key away from the homepage — and a malformed brace silently
					     stored an empty block. The metric is a fixed list, so it is a
					     dropdown; the currency question is answered by the metric
					     itself and is not asked at all. -->
					<div class="flex flex-col gap-3">
						<Label>Counters</Label>

						{#each stats as stat, index (index)}
							<div class="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
								<div class="flex min-w-48 flex-1 flex-col gap-1">
									<Label class="text-xs text-muted-foreground" for="stat-metric-{index}">
										Metric
									</Label>
									<SelectComp
										id="stat-metric-{index}"
										name="stat-metric-{index}"
										items={metricItems}
										bind:value={stat.metric}
										triggerClass="h-9 normal-case"
									/>
								</div>

								<div class="flex min-w-48 flex-1 flex-col gap-1">
									<Label class="text-xs text-muted-foreground" for="stat-label-{index}">
										Label on the page
									</Label>
									<Input
										id="stat-label-{index}"
										bind:value={stat.label}
										placeholder={METRIC_LABELS[stat.metric as MetricKey] ?? ''}
									/>
								</div>

								{#if !isMoneyMetric(stat.metric)}
									<div class="flex w-24 flex-col gap-1">
										<Label class="text-xs text-muted-foreground" for="stat-suffix-{index}">
											Suffix
										</Label>
										<Input id="stat-suffix-{index}" bind:value={stat.suffix} placeholder="+" />
									</div>
								{/if}

								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label="Remove this counter"
									onclick={() => (stats = stats.filter((_, i) => i !== index))}
								>
									<Trash2 class="size-4" />
								</Button>

								<p class="w-full text-xs text-muted-foreground">
									{#if isMoneyMetric(stat.metric)}
										Shown as currency. The figure is stored in santim and formatted as birr.
									{:else}
										The number is computed from the records; only the wording is yours.
									{/if}
								</p>
							</div>
						{/each}

						<div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onclick={() =>
									(stats = [...stats, { metric: 'families_supported', label: '', suffix: '' }])}
							>
								<Plus class="size-4" /> Add a counter
							</Button>
						</div>

						<!-- The server still receives the same `json` field; it is built
						     here rather than typed. -->
						<input type="hidden" name="json" value={JSON.stringify(stats)} />
					</div>
				{:else if blockType === 'values_list'}
					<div class="flex flex-col gap-2">
						<Label for="json">Values</Label>
						<Textarea
							id="json"
							name="json"
							rows={10}
							class="font-mono text-xs"
							value={jsonOf(editingBlock, 'values')}
							placeholder={'[\n  { "icon": "Sun", "title": "Hope", "body": "…" }\n]'}
						/>
						<p class="text-xs text-muted-foreground">
							Each value takes an <code>icon</code>, a <code>title</code> and a
							<code>body</code>, and optionally <code>title_am</code> and <code>body_am</code>.
						</p>
					</div>
				{:else if blockType === 'memoriam'}
					<div class="flex flex-col gap-2">
						<Label for="name">Name</Label>
						<Input
							id="name"
							name="name"
							placeholder="Shimeles Abera"
							value={content(editingBlock ?? ({ content: {} } as never), 'name')}
						/>
					</div>
					<FileUpload
						name="image"
						label="Portrait photo (optional)"
						image={editingBlock ? content(editingBlock, 'photo') : null}
					/>
					<div class="flex flex-col gap-2">
						<Label>Tribute text</Label>
						<RichTextEditor bind:value={richText} />
						<input type="hidden" name="body" value={richText} />
					</div>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="flex flex-col gap-2">
							<Label for="linkHref">Link to a fuller version (optional)</Label>
							<Input
								id="linkHref"
								name="linkHref"
								placeholder="/about#in-memoriam"
								value={content(editingBlock ?? ({ content: {} } as never), 'linkHref')}
							/>
						</div>
						<div class="flex flex-col gap-2">
							<Label for="linkLabel">Link text</Label>
							<Input
								id="linkLabel"
								name="linkLabel"
								placeholder="Read his full story"
								value={content(editingBlock ?? ({ content: {} } as never), 'linkLabel')}
							/>
						</div>
					</div>
					<p class="text-xs text-muted-foreground">
						Leave the link blank on the page that carries the full tribute. It only makes sense
						where this is a shorter excerpt pointing elsewhere, such as the homepage.
					</p>
				{/if}

				<Separator />

				<div class="flex flex-col gap-2">
					<Label>Visible on the site</Label>
					<SelectComp
						name="isPublished"
						items={yesNo}
						value={String(editingBlock?.isPublished ?? true)}
					/>
				</div>

				<div class="flex gap-2">
					<Button type="submit" class="flex-1">
						{editing === 'new' ? 'Add block' : 'Save changes'}
					</Button>
					<Button type="button" variant="outline" onclick={() => (editing = null)}>Cancel</Button>
				</div>
			</form>
		</ScrollArea>
	</Dialog.Content>
</Dialog.Root>
