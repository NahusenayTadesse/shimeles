<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import DynamicForm from '$lib/forms/DynamicForm.svelte';
	import {
		ArrowLeft,
		ChevronDown,
		ChevronUp,
		ExternalLink,
		Eye,
		Plus,
		ShieldCheck,
		SquarePen,
		Trash
	} from '@lucide/svelte';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.ok) toast.success('Saved');
	});

	const fieldTypes = [
		{ value: 'text', name: 'Short text' },
		{ value: 'textarea', name: 'Long text' },
		{ value: 'number', name: 'Number' },
		{ value: 'date', name: 'Date' },
		{ value: 'select', name: 'Choose one' },
		{ value: 'multiselect', name: 'Choose several' },
		{ value: 'checkbox', name: 'Tick box' },
		{ value: 'file_upload', name: 'File upload' },
		{ value: 'phone', name: 'Phone number' },
		{ value: 'email', name: 'Email address' },
		{ value: 'heading', name: 'Section heading (not a question)' }
	];

	const mapsToOptions = [
		{ value: '', name: 'Just an answer' },
		{ value: 'name', name: "The applicant's name" },
		{ value: 'phone', name: 'Their phone number' },
		{ value: 'email', name: 'Their email address' },
		{ value: 'region', name: 'Their region' }
	];

	const requiredOptions = [
		{ value: 'false', name: 'Optional' },
		{ value: 'true', name: 'Required' }
	];

	/** Which field's edit dialog is open. `'new'` opens the add dialog. */
	let editing = $state<number | 'new' | null>(null);

	const optionsPlaceholder = 'value|Label shown\ntreatment_cost|Help with treatment costs';

	/** Options are edited as one `value|Label` per line — quicker than a grid. */
	const optionsToText = (options: { value: string; label: string }[] | null) =>
		(options ?? []).map((option) => `${option.value}|${option.label}`).join('\n');

	const validationOf = (field: (typeof data.fields)[number]) =>
		(field.validation ?? {}) as Record<string, unknown>;

	/** Reordering posts the whole order, so one move is one atomic write. */
	function move(index: number, delta: number) {
		const next = [...data.fields];
		const target = index + delta;
		if (target < 0 || target >= next.length) return null;
		[next[index], next[target]] = [next[target], next[index]];
		return next.map((field) => field.id).join(',');
	}

	const editingField = $derived(
		typeof editing === 'number' ? data.fields.find((field) => field.id === editing) : null
	);
</script>

<svelte:head><title>{data.definition.name} · Form builder</title></svelte:head>

<div class="flex flex-col gap-4">
	<a
		href="/dashboard/forms"
		class={buttonVariants({ variant: 'ghost', size: 'sm', class: 'w-fit' })}
	>
		<ArrowLeft class="size-4" /> Back to forms
	</a>

	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="font-heading text-2xl font-bold">{data.definition.name}</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Changes here take effect on the public form immediately. There is nothing to publish.
			</p>
		</div>
		<a
			href={`/forms/${data.definition.slug}`}
			target="_blank"
			class={buttonVariants({ variant: 'outline', size: 'sm' })}
		>
			<ExternalLink class="size-4" /> Open the live form
		</a>
	</div>

	{#if data.definition.isLowBarrier}
		<Alert.Root>
			<ShieldCheck class="size-4" />
			<Alert.Title>This is a low-barrier form</Alert.Title>
			<Alert.Description>
				Contact fields and file uploads on this form are never required, whatever you set below.
				That is enforced when the form is validated, not just displayed, so the promise this form
				makes to the people using it cannot be broken by accident.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="grid gap-4 lg:grid-cols-2">
		<!-- The question list -->
		<Card.Root class="p-5">
			<div class="mb-4 flex items-center justify-between gap-2">
				<h2 class="font-heading text-lg font-semibold">Questions</h2>
				<Button size="sm" onclick={() => (editing = 'new')}>
					<Plus class="size-4" /> Add question
				</Button>
			</div>

			<div class="flex flex-col gap-2">
				{#each data.fields as field, index (field.id)}
					<div class="flex items-start gap-2 rounded-lg border p-3">
						<div class="flex flex-col">
							<form method="post" action="?/reorder" use:enhance>
								<input type="hidden" name="order" value={move(index, -1) ?? ''} />
								<Button
									type="submit"
									variant="ghost"
									size="icon"
									class="size-6"
									disabled={index === 0}
									aria-label="Move up"
								>
									<ChevronUp class="size-3.5" />
								</Button>
							</form>
							<form method="post" action="?/reorder" use:enhance>
								<input type="hidden" name="order" value={move(index, 1) ?? ''} />
								<Button
									type="submit"
									variant="ghost"
									size="icon"
									class="size-6"
									disabled={index === data.fields.length - 1}
									aria-label="Move down"
								>
									<ChevronDown class="size-3.5" />
								</Button>
							</form>
						</div>

						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium">{field.label}</span>
								{#if field.isRequired}
									<Badge variant="secondary" class="h-4 px-1.5 text-[10px]">Required</Badge>
								{/if}
								{#if field.mapsTo}
									<Badge variant="outline" class="h-4 px-1.5 text-[10px]">
										→ {field.mapsTo}
									</Badge>
								{/if}
							</div>
							<p class="mt-0.5 font-mono text-[11px] text-muted-foreground">
								{field.fieldKey} · {fieldTypes.find((t) => t.value === field.fieldType)?.name}
							</p>
							{#if field.showWhenFieldKey}
								<p class="mt-1 text-xs text-muted-foreground">
									Only shown when <code>{field.showWhenFieldKey}</code> is
									<code>{field.showWhenValue}</code>
								</p>
							{/if}
						</div>

						<div class="flex gap-1">
							<Button
								variant="ghost"
								size="icon"
								class="size-8"
								onclick={() => (editing = field.id)}
							>
								<SquarePen class="size-3.5" />
							</Button>
							<form method="post" action="?/deleteField" use:enhance>
								<input type="hidden" name="fieldId" value={field.id} />
								<Button
									type="submit"
									variant="ghost"
									size="icon"
									class="size-8 text-destructive"
									title="Remove this question. Answers already given are kept."
								>
									<Trash class="size-3.5" />
								</Button>
							</form>
						</div>
					</div>
				{:else}
					<p class="py-8 text-center text-sm text-muted-foreground">
						No questions yet. Add the first one.
					</p>
				{/each}
			</div>

			<p class="mt-4 text-xs text-muted-foreground">
				Removing a question hides it from the form. Answers people already gave to it are kept on
				their case files. Deleting a question must not erase what somebody told us.
			</p>
		</Card.Root>

		<!-- Live preview -->
		<Card.Root class="p-5">
			<div class="mb-4 flex items-center gap-2">
				<Eye class="size-4 text-muted-foreground" />
				<h2 class="font-heading text-lg font-semibold">Live preview</h2>
			</div>

			<ScrollArea class="h-[calc(100vh-20rem)] pr-3">
				{#if data.preview}
					<!-- The same component the public route renders, given the same
					     data. A preview that could disagree with reality would be worse
					     than no preview. -->
					<div class="pointer-events-none opacity-95 select-none">
						<DynamicForm
							form={data.preview}
							data={{ id: 'preview', valid: true, posted: false, errors: {}, data: {} }}
						/>
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">
						This form is inactive, so there is nothing to preview. Set it live on the forms list.
					</p>
				{/if}
			</ScrollArea>
		</Card.Root>
	</div>
</div>

<!-- Add / edit dialog -->
<Dialog.Root open={editing !== null} onOpenChange={(open) => !open && (editing = null)}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{editing === 'new' ? 'Add a question' : 'Edit question'}</Dialog.Title>
		</Dialog.Header>

		<ScrollArea class="max-h-[70vh] pr-3">
			<form
				method="post"
				action={editing === 'new' ? '?/addField' : '?/updateField'}
				use:enhance={() =>
					async ({ update, result }) => {
						await update({ reset: false });
						if (result.type === 'success') editing = null;
					}}
				class="flex flex-col gap-4 p-1"
			>
				{#if editingField}
					<input type="hidden" name="fieldId" value={editingField.id} />
					<input type="hidden" name="fieldKey" value={editingField.fieldKey} />
				{/if}

				<div class="flex flex-col gap-2">
					<Label for="label">Question</Label>
					<Input id="label" name="label" required value={editingField?.label ?? ''} />
				</div>

				{#if editing === 'new'}
					<div class="flex flex-col gap-2">
						<Label for="fieldKey">Storage key</Label>
						<Input id="fieldKey" name="fieldKey" required placeholder="household_size" />
						<p class="text-xs text-muted-foreground">
							How the answer is stored. It cannot be changed later, because every answer already
							given is filed under it.
						</p>
					</div>
				{/if}

				<div class="flex flex-col gap-2">
					<Label>Type of answer</Label>
					<SelectComp
						name="fieldType"
						items={fieldTypes}
						value={editingField?.fieldType ?? 'text'}
					/>
				</div>

				<div class="flex flex-col gap-2">
					<Label>Required?</Label>
					<SelectComp
						name="isRequired"
						items={requiredOptions}
						value={String(editingField?.isRequired ?? false)}
					/>
				</div>

				<div class="flex flex-col gap-2">
					<Label for="hint">Helper text under the question</Label>
					<Input id="hint" name="hint" value={editingField?.hint ?? ''} />
				</div>

				<div class="flex flex-col gap-2">
					<Label for="optionsText">Choices</Label>
					<Textarea
						id="optionsText"
						name="optionsText"
						rows={4}
						class="font-mono text-xs"
						placeholder={optionsPlaceholder}
						value={optionsToText(editingField?.options ?? null)}
					/>
					<p class="text-xs text-muted-foreground">
						One per line, as <code>value|Label</code>. Only used by "Choose one" and "Choose
						several".
					</p>
				</div>

				<Separator />

				<div class="flex flex-col gap-2">
					<Label>What is this answer?</Label>
					<SelectComp name="mapsTo" items={mapsToOptions} value={editingField?.mapsTo ?? ''} />
					<p class="text-xs text-muted-foreground">
						Marking a question as the applicant's name or phone number files the answer on the case
						record itself, so it shows in the case list without a caseworker digging for it.
					</p>
				</div>

				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-2">
						<Label for="minLength">Minimum characters</Label>
						<Input
							id="minLength"
							name="minLength"
							type="number"
							value={validationOf(editingField ?? ({} as never)).minLength ?? ''}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<Label for="maxLength">Maximum characters</Label>
						<Input
							id="maxLength"
							name="maxLength"
							type="number"
							value={validationOf(editingField ?? ({} as never)).maxLength ?? ''}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<Label for="min">Minimum value</Label>
						<Input
							id="min"
							name="min"
							type="number"
							step="any"
							value={validationOf(editingField ?? ({} as never)).min ?? ''}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<Label for="max">Maximum value</Label>
						<Input
							id="max"
							name="max"
							type="number"
							step="any"
							value={validationOf(editingField ?? ({} as never)).max ?? ''}
						/>
					</div>
				</div>

				<Separator />

				<div class="grid grid-cols-2 gap-3">
					<div class="flex flex-col gap-2">
						<Label for="showWhenFieldKey">Only show when</Label>
						<Input
							id="showWhenFieldKey"
							name="showWhenFieldKey"
							placeholder="is_professional"
							value={editingField?.showWhenFieldKey ?? ''}
						/>
					</div>
					<div class="flex flex-col gap-2">
						<Label for="showWhenValue">…equals</Label>
						<Input
							id="showWhenValue"
							name="showWhenValue"
							placeholder="yes"
							value={editingField?.showWhenValue ?? ''}
						/>
					</div>
				</div>

				<div class="flex gap-2">
					<Button type="submit" class="flex-1">
						{editing === 'new' ? 'Add question' : 'Save changes'}
					</Button>
					<Button type="button" variant="outline" onclick={() => (editing = null)}>Cancel</Button>
				</div>
			</form>
		</ScrollArea>
	</Dialog.Content>
</Dialog.Root>
