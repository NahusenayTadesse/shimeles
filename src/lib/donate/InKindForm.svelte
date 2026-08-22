<script lang="ts">
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Errors from '$lib/formComponents/Errors.svelte';
	import { focusFirstError } from '$lib/formComponents/form-errors';
	import { formDraft } from '$lib/formComponents/form-draft.svelte';
	import DraftBanner from '$lib/formComponents/DraftBanner.svelte';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import InputComp from '$lib/formComponents/InputComp.svelte';
	import CheckboxField from '$lib/formComponents/CheckboxField.svelte';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import { Copy, CircleCheck, Package, Plus, Trash2, TriangleAlert } from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import {
		CONTACT_CHANNELS,
		DONOR_TYPES,
		HANDOVER_METHODS,
		ITEM_AGE_GROUPS,
		ITEM_CONDITIONS,
		ITEM_GENDERS,
		LOAD_SIZES,
		UNIT_SUGGESTIONS,
		VALUATION_BASES,
		blankInKindItem,
		AGE_GROUP_LABELS as AGE_LABELS,
		CONDITION_LABELS,
		CONTACT_CHANNEL_LABELS as CHANNEL_LABELS,
		GENDER_LABELS,
		LOAD_SIZE_LABELS as LOAD_LABELS,
		VALUATION_LABELS,
		type InKindCategoryOption,
		type InKindSchema
	} from '$lib/inKind';

	/**
	 * Offering goods rather than money.
	 *
	 * The form asks a lot, and that is deliberate: everything here is a question
	 * a coordinator would otherwise have to ring up and ask before they could
	 * decide whether the Foundation can take the gift, or book a van for it.
	 * Only the goods themselves, a way to reach the donor and their consent are
	 * required — the rest is asked once, here, and accepted blank.
	 *
	 * The extra questions per item are driven by the category's `requires*`
	 * flags, so clothing asks about sizes and food asks about use-by dates
	 * without this component knowing what clothing or food is.
	 */
	let {
		form: formData,
		categories,
		pillars,
		initiatives,
		regions,
		s
	}: {
		form: SuperValidated<Infer<InKindSchema>>;
		categories: Pick<
			InKindCategoryOption,
			| 'id'
			| 'name'
			| 'icon'
			| 'description'
			| 'defaultUnit'
			| 'requiresExpiry'
			| 'requiresSizing'
			| 'requiresTransport'
			| 'acceptanceNote'
			| 'isAcceptingNow'
		>[];
		pillars: { id: number; name: string; icon: string | null }[];
		initiatives: { id: number; name: string }[];
		regions: { id: number; name: string }[];
		s: (key: string, fallback: string) => string;
	} = $props();

	/**
	 * `dataType: 'json'` because the offer is a list of items, each with its own
	 * quantity, condition and dates. Photos ride alongside as a plain file input
	 * read off the body on the server.
	 */
	const { form, errors, enhance, delayed, message, allErrors, tainted } = superForm(formData, {
		id: 'in-kind',
		dataType: 'json',
		resetForm: false,
		taintedMessage: 'You have not finished this form. Leave anyway?'
	});

	/** Set once the offer is recorded; the page then shows its reference. */
	let confirmation = $state<{ reference: string; summary: string } | null>(null);
	let photoNames = $state<string[]>([]);

	/*
	 * A draft of this form, kept on this device only.
	 *
	 * Saved on a debounce as the person types and offered back behind a banner
	 * — never applied on its own. Cleared the moment the form is submitted, so
	 * a finished application does not sit in the browser afterwards.
	 */
	const draft = formDraft('in-kind');

	$effect(() => {
		// Reading `$form` is what subscribes this effect to every keystroke.
		const snapshot = { ...$form };
		// `$tainted` gates it: without that, merely opening the page would write
		// a draft of the empty form and offer it back on the next visit.
		if (!confirmation && $tainted) draft.save(snapshot);
	});

	function restoreDraft() {
		const saved = draft.restore();
		if (saved) $form = { ...$form, ...saved };
	}

	$effect(() => {
		if (!$message) return;
		if ($message.type === 'error') {
			toast.error($message.text);
			// The toast fades and the summary is a long way up the page; this is
			// what actually takes the person to the question they missed.
			focusFirstError($allErrors);
		} else {
			toast.success($message.text);
			// The application is stored, so the answers still sitting in `$form`
			// are no longer unsaved work — without this the leave-guard would
			// challenge someone for navigating away from a finished submission.
			$tainted = undefined;
			// The answers are on the server now; nothing should keep a copy of a
			// household's circumstances in this browser.
			draft.discard();
			if ($message.reference) {
				confirmation = { reference: $message.reference, summary: $message.amount ?? '' };
			}
		}
	});

	const DONOR_TYPE_LABELS: Record<string, string> = {
		individual: 'Myself',
		family: 'My family',
		business: 'A business',
		school: 'A school or university',
		faith_group: 'A church or mosque',
		association: 'An association or idir',
		ngo: 'Another organisation',
		government: 'A government office',
		other: 'Something else'
	};

	const HANDOVER_LABELS: Record<string, { title: string; hint: string }> = {
		dropoff: { title: 'I will bring it', hint: 'To your office, at a time we agree.' },
		pickup: { title: 'Please collect it', hint: 'Come to my address and take it away.' },
		courier: { title: 'I will send it', hint: 'By courier or with a driver.' },
		already_shipped: {
			title: 'It is on its way',
			hint: 'Already shipped, from abroad or elsewhere.'
		}
	};

	const categoryById = $derived(new Map(categories.map((category) => [category.id, category])));

	/** New lines open on a category we are actually taking, never a paused one. */
	const blankItem = () => {
		const first = categories.find((category) => category.isAcceptingNow) ?? categories[0];
		return blankInKindItem(first?.id ?? null, first?.defaultUnit ?? 'items');
	};

	const addItem = () => ($form.items = [...$form.items, blankItem()]);

	const removeItem = (index: number) => {
		$form.items = $form.items.filter((_, position) => position !== index);
	};

	/**
	 * Choosing a category re-seeds the unit, unless the donor has already
	 * changed it themselves — "boxes" for clothing, "kg" for fresh food.
	 */
	const chooseCategory = (index: number, categoryId: number | null) => {
		const previous = $form.items[index];
		const wasDefault =
			previous.unit === (categoryById.get(previous.categoryId ?? -1)?.defaultUnit ?? 'items');

		$form.items = $form.items.map((item, position) =>
			position === index
				? {
						...item,
						categoryId,
						unit: wasDefault
							? (categoryById.get(categoryId ?? -1)?.defaultUnit ?? item.unit)
							: item.unit
					}
				: item
		);
	};

	/** The acceptance notes for what has actually been chosen, shown once each. */
	const acceptanceNotes = $derived(
		[...new Set($form.items.map((item) => item.categoryId))]
			.map((id) => categoryById.get(id ?? -1))
			.filter((category) => category?.acceptanceNote)
			.map((category) => ({ name: category!.name, note: category!.acceptanceNote! }))
	);

	/** A collection is assumed when anything chosen is bulky. */
	const suggestsTransport = $derived(
		$form.items.some((item) => categoryById.get(item.categoryId ?? -1)?.requiresTransport)
	);

	const isOrganisation = $derived($form.donorType !== 'individual' && $form.donorType !== 'family');

	const onPhotos = (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		photoNames = Array.from(input.files ?? []).map((file) => file.name);
	};

	const copyReference = async () => {
		if (!confirmation) return;
		await navigator.clipboard.writeText(confirmation.reference);
		toast.success('Reference copied');
	};
</script>

{#if confirmation}
	<div class="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
		<div class="rounded-full bg-accent p-4 text-accent-foreground">
			<CircleCheck class="size-8" />
		</div>
		<h2 class="font-heading text-2xl font-semibold">Thank you</h2>
		<p class="text-muted-foreground">
			We have your offer of <strong>{confirmation.summary}</strong>. Someone will call to confirm
			what we are able to take and to arrange the handover. Please hold on to everything until then.
		</p>
		<button
			type="button"
			onclick={copyReference}
			class="flex items-center gap-2 rounded-full bg-muted px-5 py-3 font-mono text-lg font-semibold"
		>
			{confirmation.reference}
			<Copy class="size-4 opacity-60" />
		</button>
		<Button variant="outline" onclick={() => (confirmation = null)} class="mt-2">
			Offer something else
		</Button>
	</div>
{:else}
	<!-- `enctype` is not optional here: the form carries a file input for the
	     photographs, and without it SvelteKit warns (and in dev throws) that an
	     enhanced submit and a native one will not behave the same. -->
	<form
		method="post"
		action="?/giftInKind"
		enctype="multipart/form-data"
		use:enhance
		class="flex flex-col gap-5"
	>
		<div class="flex items-center gap-2">
			<Package class="size-5 text-primary" />
			<h2 class="font-heading text-xl font-semibold">
				{s('donate.goods_title', 'Give goods or services')}
			</h2>
		</div>
		<p class="-mt-3 text-sm text-muted-foreground">
			{s(
				'donate.goods_intro',
				'Clothes, food, school supplies, furniture, or a few hours of your professional time. Tell us what you have and we will call to arrange it.'
			)}
		</p>

		{#if draft.available}
			<DraftBanner
				savedAt={draft.savedAt}
				onrestore={restoreDraft}
				ondiscard={() => draft.discard()}
			/>
		{/if}

		<Errors allErrors={$allErrors} />

		<!-- ==================== What you are giving ==================== -->
		<div class="flex flex-col gap-3">
			<Label>{s('donate.goods_items', 'What would you like to give?')}</Label>

			{#each $form.items as item, index (index)}
				{@const category = categoryById.get(item.categoryId ?? -1)}
				<div class="flex flex-col gap-3 rounded-2xl border bg-muted/30 p-4">
					<div class="flex items-start justify-between gap-2">
						<span class="text-sm font-medium">Item {index + 1}</span>
						{#if $form.items.length > 1}
							<Button
								type="button"
								variant="ghost"
								size="icon"
								class="size-7"
								onclick={() => removeItem(index)}
								aria-label="Remove item {index + 1}"
							>
								<Trash2 class="size-4" />
							</Button>
						{/if}
					</div>

					<div class="grid gap-3 md:grid-cols-2">
						<div class="flex flex-col gap-2">
							<Label for="category-{index}">Kind of thing</Label>
							<Select.Root
								type="single"
								value={item.categoryId ? String(item.categoryId) : ''}
								onValueChange={(value) => chooseCategory(index, value ? Number(value) : null)}
							>
								<Select.Trigger id="category-{index}" class="w-full">
									{category?.name ?? 'Choose a category'}
								</Select.Trigger>
								<Select.Content>
									{#each categories as option (option.id)}
										<Select.Item value={String(option.id)} disabled={!option.isAcceptingNow}>
											{option.name}{option.isAcceptingNow ? '' : ' (paused)'}
										</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
							{#if category?.description}
								<p class="text-xs text-muted-foreground">{category.description}</p>
							{/if}
						</div>

						<InputComp
							{errors}
							bind:value={item.description}
							name="description-{index}"
							label="Describe it"
							type="text"
							placeholder="Children's winter coats"
							labelClass=""
						/>
					</div>

					<div class="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
						<InputComp
							{errors}
							bind:value={item.quantity}
							name="quantity-{index}"
							label="How many"
							type="number"
							min="1"
							labelClass=""
						/>
						<InputComp
							{errors}
							bind:value={item.unit}
							name="unit-{index}"
							label="Counted in"
							type="text"
							placeholder="bags, boxes, kg…"
							labelClass=""
						/>
						<div class="flex flex-col gap-2">
							<Label for="condition-{index}">Condition</Label>
							<Select.Root
								type="single"
								value={item.condition}
								onValueChange={(value) =>
									(item.condition = (value || 'good') as typeof item.condition)}
							>
								<Select.Trigger id="condition-{index}" class="w-full">
									{CONDITION_LABELS[item.condition]}
								</Select.Trigger>
								<Select.Content>
									{#each ITEM_CONDITIONS as condition (condition)}
										<Select.Item value={condition}>{CONDITION_LABELS[condition]}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					</div>

					<!-- Sizing, for anything that has to fit somebody. Driven by the
					     category, so a new clothing category asks these too. -->
					{#if category?.requiresSizing}
						<div class="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
							<div class="flex flex-col gap-2">
								<Label for="ageGroup-{index}">Who would it fit?</Label>
								<Select.Root
									type="single"
									value={item.ageGroup}
									onValueChange={(value) =>
										(item.ageGroup = (value || 'any') as typeof item.ageGroup)}
								>
									<Select.Trigger id="ageGroup-{index}" class="w-full">
										{AGE_LABELS[item.ageGroup]}
									</Select.Trigger>
									<Select.Content>
										{#each ITEM_AGE_GROUPS as group (group)}
											<Select.Item value={group}>{AGE_LABELS[group]}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
							<div class="flex flex-col gap-2">
								<Label for="gender-{index}">Made for</Label>
								<Select.Root
									type="single"
									value={item.gender}
									onValueChange={(value) =>
										(item.gender = (value || 'unisex') as typeof item.gender)}
								>
									<Select.Trigger id="gender-{index}" class="w-full">
										{GENDER_LABELS[item.gender]}
									</Select.Trigger>
									<Select.Content>
										{#each ITEM_GENDERS as gender (gender)}
											<Select.Item value={gender}>{GENDER_LABELS[gender]}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</div>
							<div class="flex flex-col gap-2 sm:col-span-2 md:col-span-1">
								<Label for="sizeRange-{index}">Sizes</Label>
								<Input
									id="sizeRange-{index}"
									bind:value={item.sizeRange}
									placeholder="4–6 years, or EU 38–42"
								/>
							</div>
						</div>
					{/if}

					<!-- Anything with a clock on it: food, medicine, formula. -->
					{#if category?.requiresExpiry}
						<div class="grid gap-3 sm:grid-cols-2">
							<InputComp
								{errors}
								bind:value={item.expiresOn}
								name="expiresOn-{index}"
								label="Use by"
								type="date"
								labelClass=""
							/>
							<div class="flex flex-col justify-end gap-2 pb-2">
								<CheckboxField bind:checked={item.needsRefrigeration} label="Needs to stay cold" />
								<CheckboxField bind:checked={item.isPerishable} label="Spoils quickly" />
							</div>
						</div>
					{/if}

					<div class="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
						<div class="flex flex-col gap-2">
							<Label for="brandOrModel-{index}">Make or model</Label>
							<Input
								id="brandOrModel-{index}"
								bind:value={item.brandOrModel}
								placeholder="Optional"
							/>
						</div>
						<div class="flex flex-col gap-2">
							<Label for="estimatedValue-{index}">Worth (ETB)</Label>
							<Input
								id="estimatedValue-{index}"
								type="number"
								min="0"
								value={item.estimatedValue ?? ''}
								oninput={(event) => {
									const raw = (event.currentTarget as HTMLInputElement).value;
									item.estimatedValue = raw === '' ? null : Number(raw);
								}}
								placeholder="If you know"
							/>
						</div>
						<InputComp
							{errors}
							bind:value={item.notes}
							name="notes-{index}"
							label="Anything else about it?"
							type="text"
							placeholder="Optional"
							labelClass=""
						/>
					</div>
				</div>
			{/each}

			<datalist id="in-kind-units">
				{#each UNIT_SUGGESTIONS as unit (unit)}
					<option value={unit}></option>
				{/each}
			</datalist>

			<div>
				<Button type="button" variant="outline" size="sm" onclick={addItem}>
					<Plus class="size-4" />
					Add another item
				</Button>
			</div>

			{#if $errors.items?._errors}
				<p class="text-sm text-destructive">{$errors.items._errors}</p>
			{/if}

			{#if acceptanceNotes.length}
				<div class="rounded-lg border border-dashed p-3">
					<p class="mb-1 text-xs font-medium">Worth knowing before you pack:</p>
					<ul class="ml-4 list-disc text-xs text-muted-foreground">
						{#each acceptanceNotes as note (note.name)}
							<li>{note.name}: {note.note}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>

		<!-- Photos. The difference between accepting a donation and guessing. -->
		<div class="flex flex-col gap-2">
			<Label for="in-kind-photos">Photographs</Label>
			<Input
				id="in-kind-photos"
				type="file"
				name="photos"
				multiple
				accept="image/*"
				onchange={onPhotos}
			/>
			<p class="text-xs text-muted-foreground">
				Optional, and the single most useful thing you can send: a photo answers most of what we
				would otherwise have to ask on the phone. Up to eight.
			</p>
			{#if photoNames.length}
				<div class="flex flex-wrap gap-2">
					{#each photoNames as name (name)}
						<Badge variant="secondary">{name}</Badge>
					{/each}
				</div>
			{/if}
		</div>

		<!-- ==================== Getting hold of it ==================== -->
		<div class="flex flex-col gap-2">
			<Label>{s('donate.goods_handover', 'How should we take it from you?')}</Label>
			<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
				{#each HANDOVER_METHODS as method (method)}
					<button
						type="button"
						onclick={() => ($form.handoverMethod = method)}
						class={cn(
							'flex flex-col gap-0.5 rounded-2xl border p-3.5 text-left text-sm transition-colors',
							$form.handoverMethod === method ? 'border-primary bg-primary/5' : 'hover:bg-muted'
						)}
					>
						<span class="font-medium">{HANDOVER_LABELS[method].title}</span>
						<span class="text-xs text-muted-foreground">{HANDOVER_LABELS[method].hint}</span>
					</button>
				{/each}
			</div>
		</div>

		{#if suggestsTransport && $form.handoverMethod === 'dropoff'}
			<p class="-mt-2 flex items-start gap-2 text-xs text-muted-foreground">
				<TriangleAlert class="mt-0.5 size-3.5 shrink-0" />
				Furniture and appliances are usually easier for us to collect, so choose "please collect it" if
				that suits you better.
			</p>
		{/if}

		{#if $form.handoverMethod === 'pickup'}
			<div class="flex flex-col gap-3 rounded-2xl border bg-muted/30 p-4">
				<p class="text-sm font-medium">Where should we come?</p>

				<div class="grid gap-2 sm:grid-cols-2">
					<InputComp
						{errors}
						bind:value={$form.pickupContactName}
						name="pickupContactName"
						label="Who will be there?"
						type="text"
						placeholder="If it is not you"
						labelClass=""
					/>
					<InputComp
						{errors}
						bind:value={$form.pickupContactPhone}
						name="pickupContactPhone"
						label="Their phone"
						type="tel"
						labelClass=""
					/>
				</div>

				<InputComp
					{errors}
					bind:value={$form.pickupAddressLine}
					name="pickupAddressLine"
					label="Address"
					type="text"
					labelClass=""
				/>

				<div class="grid gap-2 sm:grid-cols-2">
					<InputComp
						{errors}
						bind:value={$form.pickupCity}
						name="pickupCity"
						label="Town or sub-city"
						type="text"
						labelClass=""
					/>
					<InputComp
						{errors}
						bind:value={$form.pickupLandmark}
						name="pickupLandmark"
						label="Nearest landmark"
						type="text"
						placeholder="Behind the Total station"
						labelClass=""
					/>
				</div>

				{#if regions.length > 1}
					<div class="flex flex-col gap-2">
						<Label for="in-kind-region">Region</Label>
						<Select.Root
							type="single"
							value={$form.regionId ? String($form.regionId) : ''}
							onValueChange={(value) => ($form.regionId = value ? Number(value) : null)}
						>
							<Select.Trigger id="in-kind-region" class="w-full">
								{regions.find((region) => region.id === $form.regionId)?.name ?? 'Choose a region'}
							</Select.Trigger>
							<Select.Content>
								{#each regions as region (region.id)}
									<Select.Item value={String(region.id)}>{region.name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				{/if}

				<InputComp
					{errors}
					bind:value={$form.accessNotes}
					name="accessNotes"
					label="Anything the driver should know?"
					type="textarea"
					placeholder="Third floor, no lift. Gate locked after six."
					rows={2}
					labelClass=""
				/>
			</div>
		{/if}

		<div class="flex flex-col gap-2">
			<Label for="loadSize">How much is there?</Label>
			<Select.Root
				type="single"
				value={$form.loadSize}
				onValueChange={(value) => ($form.loadSize = (value || 'car_boot') as typeof $form.loadSize)}
			>
				<Select.Trigger id="loadSize" class="w-full">{LOAD_LABELS[$form.loadSize]}</Select.Trigger>
				<Select.Content>
					{#each LOAD_SIZES as size (size)}
						<Select.Item value={size}>{LOAD_LABELS[size]}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<div class="flex flex-col gap-2">
				<Label for="estimatedWeightKg">Rough weight (kg)</Label>
				<Input
					id="estimatedWeightKg"
					type="number"
					min="0"
					value={$form.estimatedWeightKg ?? ''}
					oninput={(event) => {
						const raw = (event.currentTarget as HTMLInputElement).value;
						$form.estimatedWeightKg = raw === '' ? null : Number(raw);
					}}
					placeholder="If you know"
				/>
			</div>
			<div class="flex flex-col justify-end gap-2 pb-2">
				<CheckboxField bind:checked={$form.requiresVehicle} label="A vehicle will be needed" />
				<CheckboxField
					bind:checked={$form.requiresHelpLoading}
					label="Help with lifting will be needed"
				/>
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<InputComp
				{errors}
				bind:value={$form.availableFrom}
				name="availableFrom"
				label="Ready from"
				type="date"
				labelClass=""
			/>
			<InputComp
				{errors}
				bind:value={$form.availableUntil}
				name="availableUntil"
				label="And available until"
				type="date"
				labelClass=""
			/>
		</div>

		<!-- Designation. Same programmes as a cash gift, from the database. -->
		<div class="flex flex-col gap-2">
			<Label>{s('donate.designation', 'Where should it go?')}</Label>
			<div class="flex flex-wrap gap-2">
				<Button
					type="button"
					variant={$form.designationType === 'general_fund' ? 'default' : 'outline'}
					size="sm"
					onclick={() => {
						$form.designationType = 'general_fund';
						$form.designationPillarId = null;
						$form.designationInitiativeId = null;
					}}
				>
					{s('donate.general_fund', 'Where most needed')}
				</Button>
				{#each pillars as pillar (pillar.id)}
					<Button
						type="button"
						variant={$form.designationPillarId === pillar.id ? 'default' : 'outline'}
						size="sm"
						onclick={() => {
							$form.designationType = 'pillar';
							$form.designationPillarId = pillar.id;
							$form.designationInitiativeId = null;
						}}
					>
						<DynamicIcon name={pillar.icon} class="size-4" />
						{pillar.name}
					</Button>
				{/each}
				{#each initiatives as initiative (initiative.id)}
					<Button
						type="button"
						variant={$form.designationInitiativeId === initiative.id ? 'default' : 'outline'}
						size="sm"
						onclick={() => {
							$form.designationType = 'future_initiative';
							$form.designationInitiativeId = initiative.id;
							$form.designationPillarId = null;
						}}
					>
						{initiative.name}
					</Button>
				{/each}
			</div>
		</div>

		<!-- ==================== Who is giving ==================== -->
		<div class="grid gap-3 md:grid-cols-2">
			<div class="flex flex-col gap-2">
				<Label for="in-kind-donorType">This gift is from</Label>
				<Select.Root
					type="single"
					value={$form.donorType}
					onValueChange={(value) =>
						($form.donorType = (value || 'individual') as typeof $form.donorType)}
				>
					<Select.Trigger id="in-kind-donorType" class="w-full">
						{DONOR_TYPE_LABELS[$form.donorType]}
					</Select.Trigger>
					<Select.Content>
						{#each DONOR_TYPES as type (type)}
							<Select.Item value={type}>{DONOR_TYPE_LABELS[type]}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>

			<InputComp
				{errors}
				bind:value={$form.donorName}
				name="in-kind-donorName"
				label={s('donate.name', 'Your name')}
				type="text"
				required
				labelClass=""
			/>
		</div>

		{#if isOrganisation}
			<InputComp
				{errors}
				bind:value={$form.organisationName}
				name="organisationName"
				label="Name of the organisation"
				type="text"
				labelClass=""
			/>
		{/if}

		<div class="grid gap-3 sm:grid-cols-2">
			<InputComp
				{errors}
				bind:value={$form.donorEmail}
				name="in-kind-donorEmail"
				label={s('donate.email', 'Email')}
				type="email"
				labelClass=""
			/>
			<InputComp
				{errors}
				bind:value={$form.donorPhone}
				name="in-kind-donorPhone"
				label={s('donate.phone', 'Phone')}
				type="tel"
				labelClass=""
			/>
		</div>

		<div class="grid gap-3 sm:grid-cols-2">
			<div class="flex flex-col gap-2">
				<Label for="preferredContactChannel">Best way to reach you</Label>
				<Select.Root
					type="single"
					value={$form.preferredContactChannel}
					onValueChange={(value) =>
						($form.preferredContactChannel = (value ||
							'phone') as typeof $form.preferredContactChannel)}
				>
					<Select.Trigger id="preferredContactChannel" class="w-full">
						{CHANNEL_LABELS[$form.preferredContactChannel]}
					</Select.Trigger>
					<Select.Content>
						{#each CONTACT_CHANNELS as channel (channel)}
							<Select.Item value={channel}>{CHANNEL_LABELS[channel]}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<InputComp
				{errors}
				bind:value={$form.bestTimeToContact}
				name="bestTimeToContact"
				label="Best time"
				type="text"
				placeholder="Afternoons, after 6pm…"
				labelClass=""
			/>
		</div>

		<!-- ==================== Paperwork ==================== -->
		<div class="flex flex-col gap-2">
			<Label for="valuationBasis">Where the values above come from</Label>
			<Select.Root
				type="single"
				value={$form.valuationBasis}
				onValueChange={(value) =>
					($form.valuationBasis = (value || 'donor_estimate') as typeof $form.valuationBasis)}
			>
				<Select.Trigger id="valuationBasis" class="w-full">
					{VALUATION_LABELS[$form.valuationBasis]}
				</Select.Trigger>
				<Select.Content>
					{#each VALUATION_BASES as basis (basis)}
						<Select.Item value={basis}>{VALUATION_LABELS[basis]}</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
			<p class="text-xs text-muted-foreground">
				Only ever an estimate, kept for our records and your receipt. It is never counted as money
				raised.
			</p>
		</div>

		<div class="flex flex-col gap-2">
			<CheckboxField
				bind:checked={$form.hasRestrictedItems}
				label="Some of it is medicine, or equipment with rules attached"
			/>
			{#if $form.hasRestrictedItems}
				<Textarea
					rows={2}
					bind:value={$form.restrictedItemsNote}
					placeholder="Tell us what, and where it came from. It decides whether we may accept it."
				/>
			{/if}

			<CheckboxField bind:checked={$form.receiptRequested} label="Please send me a receipt" />
			<CheckboxField
				bind:checked={$form.taxReceiptRequired}
				label="I need a receipt valid for tax"
			/>
			{#if $form.taxReceiptRequired}
				<InputComp
					{errors}
					bind:value={$form.taxIdNumber}
					name="taxIdNumber"
					label="TIN"
					type="text"
					labelClass=""
				/>
			{/if}

			<CheckboxField
				bind:checked={$form.isAnonymous}
				label={s('donate.anonymous', 'Keep my gift anonymous')}
			/>
			{#if !$form.isAnonymous}
				<div class="mt-2 flex flex-col gap-2">
					<Label for="recognitionName">Name us to thank, if not your own</Label>
					<Input
						id="recognitionName"
						bind:value={$form.recognitionName}
						placeholder="The Abera family, or your company"
					/>
				</div>
			{/if}
		</div>

		<InputComp
			{errors}
			bind:value={$form.donorMessage}
			name="in-kind-message"
			label={s('donate.message', 'A message, if you would like')}
			type="textarea"
			rows={3}
			labelClass=""
		/>

		<InputComp
			{errors}
			bind:value={$form.heardAbout}
			name="heardAbout"
			label="How did you hear about us?"
			type="text"
			placeholder="Optional"
			labelClass=""
		/>

		<div class="flex flex-col gap-2">
			<CheckboxField
				bind:checked={$form.isDiaspora}
				label={s('donate.is_diaspora', 'I am giving from outside Ethiopia')}
			/>
			<CheckboxField
				bind:checked={$form.joinNewsletter}
				label={s('donate.newsletter', 'Send me occasional updates')}
			/>
			<CheckboxField
				{errors}
				bind:checked={$form.consentToContact}
				name="consentToContact"
				label="You may keep these details and contact me to arrange the handover."
			/>
		</div>

		<div class="hidden" aria-hidden="true">
			<input
				name="website"
				type="text"
				tabindex="-1"
				autocomplete="off"
				bind:value={$form.website}
			/>
		</div>

		<Button type="submit" size="lg" class="lg:w-fit lg:self-end lg:px-10">
			{#if $delayed}
				<LoadingBtn name={s('donate.goods_sending', 'Recording your offer')} />
			{:else}
				<Package class="size-4" />
				{s('donate.goods_submit', 'Offer these goods')}
			{/if}
		</Button>
	</form>
{/if}
