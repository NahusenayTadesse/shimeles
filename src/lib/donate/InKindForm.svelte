<script lang="ts">
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Errors from '$lib/formComponents/Errors.svelte';
	import { fieldId, focusFirstError } from '$lib/formComponents/form-errors';
	import { formDraft } from '$lib/formComponents/form-draft.svelte';
	import DraftBanner from '$lib/formComponents/DraftBanner.svelte';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import InputComp from '$lib/formComponents/InputComp.svelte';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import CheckboxField from '$lib/formComponents/CheckboxField.svelte';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import {
		ChevronLeft,
		ChevronRight,
		Copy,
		CircleCheck,
		Package,
		Plus,
		Trash2,
		TriangleAlert
	} from '@lucide/svelte';
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
		inKindSchema,
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
	const { form, errors, enhance, delayed, message, allErrors, tainted, validateForm } = superForm(
		formData,
		{
			id: 'in-kind',
			dataType: 'json',
			resetForm: false,
			taintedMessage: 'You have not finished this form. Leave anyway?'
		}
	);

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
			// The step that holds the first complaint, before focusing it: the
			// field is on a hidden step as often as not, and focusing something
			// `display:none` moves nobody.
			const landing = STEPS.findIndex((_, index) => errorsOnStep(index).length > 0);
			if (landing >= 0 && landing !== step) goTo(landing);
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

	/**
	 * The form in four steps.
	 *
	 * Everything it asks is worth asking — a coordinator would otherwise ring
	 * up and ask it — but all of it at once is a page you scroll for a minute
	 * before you reach a submit button, and people were not reaching it. The
	 * questions are unchanged; they are just dealt out four screens at a time,
	 * in the order the conversation would go: what have you got, how do we get
	 * it, who are you, and the paperwork.
	 *
	 * Steps are hidden with CSS rather than unmounted. The photographs ride on
	 * a native file input that the server reads straight off the body, and a
	 * step that leaves the DOM takes the chosen files with it — along with
	 * every uncommitted combobox and date field on it.
	 *
	 * `fields` is what a step owns, and it is what decides two things: whether
	 * "Next" may pass, and which step a failed submit jumps to. Anything not
	 * listed is optional and cannot block anybody.
	 */
	const STEPS = [
		{
			title: 'What you are giving',
			hint: 'The things themselves, and a photograph if you have one.',
			fields: ['items']
		},
		{
			title: 'Getting it to us',
			hint: 'How it reaches us, and which programme it should go to.',
			fields: [
				'handoverMethod',
				'pickupContactName',
				'pickupContactPhone',
				'pickupAddressLine',
				'pickupCity',
				'pickupLandmark',
				'accessNotes',
				'regionId',
				'loadSize',
				'estimatedWeightKg',
				'requiresVehicle',
				'requiresHelpLoading',
				'availableFrom',
				'availableUntil',
				'designationType',
				'designationPillarId',
				'designationInitiativeId'
			]
		},
		{
			title: 'About you',
			hint: 'Who we should call, and when.',
			fields: [
				'donorType',
				'donorName',
				'organisationName',
				'donorEmail',
				'donorPhone',
				'preferredContactChannel',
				'bestTimeToContact'
			]
		},
		{
			title: 'Last few things',
			hint: 'Receipts, recognition, and your permission to ring you.',
			fields: [
				'valuationBasis',
				'hasRestrictedItems',
				'restrictedItemsNote',
				'receiptRequested',
				'taxReceiptRequired',
				'taxIdNumber',
				'isAnonymous',
				'recognitionName',
				'donorMessage',
				'heardAbout',
				'isDiaspora',
				'joinNewsletter',
				'consentToContact'
			]
		}
	];

	let step = $state(0);
	const isLastStep = $derived(step === STEPS.length - 1);

	/** `items.0.description` belongs to `items`, so only the root is compared. */
	const rootOf = (path: unknown) => String(fieldId(path) ?? '').split('.')[0];

	const errorsOnStep = (index: number) =>
		$allErrors.filter((entry) => STEPS[index].fields.includes(rootOf(entry.path)));

	/**
	 * Which steps have been left behind, so the header can mark them done and
	 * let somebody click back to one. A step ahead is not clickable: it would
	 * skip the check below and land them on a submit button with three
	 * unanswered questions behind it.
	 */
	let furthest = $state(0);

	const goTo = (index: number) => {
		step = index;
		if (index > furthest) furthest = index;
		// The header, not the top of the document: the page above this form is
		// the hero and the payment notices, and re-reading them at every step
		// is not progress.
		stepHeader?.scrollIntoView({ block: 'start', behavior: 'smooth' });
	};

	let stepHeader: HTMLElement | undefined = $state();

	/**
	 * Checked against the whole schema, then filtered to this step.
	 *
	 * Superforms has no notion of a partial form, and asking it for one would
	 * mean a second schema to keep in step with the first — so the real one
	 * runs and the complaints belonging to a question not yet asked are simply
	 * dropped. The step's own complaints are written back to `errors`, which is
	 * what draws the red text under each field and fills the summary; the form
	 * sets no `validators` of its own, so nothing else is writing to that store
	 * between submits and this cannot fight with it.
	 */
	async function next() {
		const result = await validateForm({ schema: zod4(inKindSchema) });
		const mine = Object.fromEntries(
			Object.entries(result.errors).filter(([key]) => STEPS[step].fields.includes(key))
		);

		$errors = mine as typeof $errors;
		if (Object.keys(mine).length) {
			focusFirstError($allErrors);
			return;
		}
		goTo(step + 1);
	}

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

	/**
	 * Option lists for the comboboxes. A paused category is still listed —
	 * a donor should see that we know about it — but cannot be chosen.
	 */
	const categoryItems = $derived(
		categories.map((option) => ({
			value: String(option.id),
			name: option.isAcceptingNow ? option.name : `${option.name} (paused)`,
			disabled: !option.isAcceptingNow
		}))
	);

	const regionItems = $derived(
		regions.map((region) => ({ value: String(region.id), name: region.name }))
	);

	const conditionItems = ITEM_CONDITIONS.map((condition) => ({
		value: condition,
		name: CONDITION_LABELS[condition]
	}));

	const ageGroupItems = ITEM_AGE_GROUPS.map((group) => ({
		value: group,
		name: AGE_LABELS[group]
	}));

	const itemGenderItems = ITEM_GENDERS.map((gender) => ({
		value: gender,
		name: GENDER_LABELS[gender]
	}));

	const loadSizeItems = LOAD_SIZES.map((size) => ({ value: size, name: LOAD_LABELS[size] }));

	const donorTypeItems = DONOR_TYPES.map((type) => ({
		value: type,
		name: DONOR_TYPE_LABELS[type]
	}));

	const channelItems = CONTACT_CHANNELS.map((channel) => ({
		value: channel,
		name: CHANNEL_LABELS[channel]
	}));

	const valuationItems = VALUATION_BASES.map((basis) => ({
		value: basis,
		name: VALUATION_LABELS[basis]
	}));

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

		<!-- The header doubles as the progress bar and the way back. A step
		     already left behind is a button; a step ahead is not, because
		     reaching it means passing the check on the one before. -->
		<div bind:this={stepHeader} class="flex scroll-mt-28 flex-col gap-3">
			<ol class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
				{#each STEPS as entry, index (entry.title)}
					<li class="flex items-center gap-2">
						{#if index > 0}
							<span class="text-muted-foreground/40" aria-hidden="true">/</span>
						{/if}
						<button
							type="button"
							disabled={index > furthest}
							onclick={() => goTo(index)}
							aria-current={index === step ? 'step' : undefined}
							class={cn(
								'flex items-center gap-1.5 rounded-full px-2 py-1 transition-colors',
								index === step
									? 'bg-primary/10 font-semibold text-primary'
									: index <= furthest
										? 'text-muted-foreground hover:bg-muted'
										: 'text-muted-foreground/50'
							)}
						>
							<span
								class={cn(
									'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
									index === step
										? 'border-primary bg-primary text-primary-foreground'
										: index < furthest
											? 'border-success/40 bg-success/10 text-success'
											: 'border-muted-foreground/30'
								)}
							>
								{#if index < furthest}
									<CircleCheck class="size-3" />
								{:else}
									{index + 1}
								{/if}
							</span>
							{entry.title}
						</button>
					</li>
				{/each}
			</ol>

			<div class="h-1 w-full overflow-hidden rounded-full bg-muted">
				<div
					class="h-full rounded-full bg-primary transition-all duration-300"
					style="width: {((step + 1) / STEPS.length) * 100}%"
				></div>
			</div>

			<p class="text-sm text-muted-foreground">{STEPS[step].hint}</p>
		</div>

		<!-- ==================== What you are giving ==================== -->
		<div class={cn('flex flex-col gap-5', step !== 0 && 'hidden')}>
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
								<SelectComp
									id="category-{index}"
									name="categoryId-{index}"
									value={item.categoryId ? String(item.categoryId) : ''}
									items={categoryItems}
									triggerClass="normal-case"
									placeholder="Choose a category"
									onValueChange={(value) => chooseCategory(index, value ? Number(value) : null)}
								/>
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
								<SelectComp
									id="condition-{index}"
									name="condition-{index}"
									value={item.condition}
									items={conditionItems}
									searchable={false}
									triggerClass="normal-case"
									onValueChange={(value) =>
										(item.condition = (value || 'good') as typeof item.condition)}
								/>
							</div>
						</div>

						<!-- Sizing, for anything that has to fit somebody. Driven by the
					     category, so a new clothing category asks these too. -->
						{#if category?.requiresSizing}
							<div class="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
								<div class="flex flex-col gap-2">
									<Label for="ageGroup-{index}">Who would it fit?</Label>
									<SelectComp
										id="ageGroup-{index}"
										name="ageGroup-{index}"
										value={item.ageGroup}
										items={ageGroupItems}
										searchable={false}
										triggerClass="normal-case"
										onValueChange={(value) =>
											(item.ageGroup = (value || 'any') as typeof item.ageGroup)}
									/>
								</div>
								<div class="flex flex-col gap-2">
									<Label for="gender-{index}">Made for</Label>
									<SelectComp
										id="gender-{index}"
										name="gender-{index}"
										value={item.gender}
										items={itemGenderItems}
										searchable={false}
										triggerClass="normal-case"
										onValueChange={(value) =>
											(item.gender = (value || 'unisex') as typeof item.gender)}
									/>
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
									<CheckboxField
										bind:checked={item.needsRefrigeration}
										label="Needs to stay cold"
									/>
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
		</div>

		<!-- ==================== Getting hold of it ==================== -->
		<div class={cn('flex flex-col gap-5', step !== 1 && 'hidden')}>
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
					Furniture and appliances are usually easier for us to collect, so choose "please collect it"
					if that suits you better.
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
							<SelectComp
								id="in-kind-region"
								name="regionId"
								value={$form.regionId ? String($form.regionId) : ''}
								items={regionItems}
								triggerClass="normal-case"
								placeholder="Choose a region"
								onValueChange={(value) => ($form.regionId = value ? Number(value) : null)}
							/>
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
				<SelectComp
					id="loadSize"
					name="loadSize"
					value={$form.loadSize}
					items={loadSizeItems}
					searchable={false}
					triggerClass="normal-case"
					onValueChange={(value) =>
						($form.loadSize = (value || 'car_boot') as typeof $form.loadSize)}
				/>
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
		</div>

		<!-- ==================== Who is giving ==================== -->
		<div class={cn('flex flex-col gap-5', step !== 2 && 'hidden')}>
			<div class="grid gap-3 md:grid-cols-2">
				<div class="flex flex-col gap-2">
					<Label for="in-kind-donorType">This gift is from</Label>
					<SelectComp
						id="in-kind-donorType"
						name="donorType"
						value={$form.donorType}
						items={donorTypeItems}
						triggerClass="normal-case"
						onValueChange={(value) =>
							($form.donorType = (value || 'individual') as typeof $form.donorType)}
					/>
				</div>

				<InputComp
					{errors}
					bind:value={$form.donorName}
					name="in-kind-donorName"
					label={s('donate.name', 'Your name')}
					type="text"
					showRequired
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
					<SelectComp
						id="preferredContactChannel"
						name="preferredContactChannel"
						value={$form.preferredContactChannel}
						items={channelItems}
						searchable={false}
						triggerClass="normal-case"
						onValueChange={(value) =>
							($form.preferredContactChannel = (value ||
								'phone') as typeof $form.preferredContactChannel)}
					/>
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
		</div>

		<!-- ==================== Paperwork ==================== -->
		<div class={cn('flex flex-col gap-5', step !== 3 && 'hidden')}>
			<div class="flex flex-col gap-2">
				<Label for="valuationBasis">Where the values above come from</Label>
				<SelectComp
					id="valuationBasis"
					name="valuationBasis"
					value={$form.valuationBasis}
					items={valuationItems}
					triggerClass="normal-case"
					onValueChange={(value) =>
						($form.valuationBasis = (value || 'donor_estimate') as typeof $form.valuationBasis)}
				/>
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

		<!-- One submit button, on the last step only. A `type="button"` Next
		     everywhere else, so pressing Enter in a text field on step one does
		     not post a form the donor has answered a quarter of. -->
		<div class="flex items-center justify-between gap-3 border-t pt-5">
			<Button
				type="button"
				variant="ghost"
				disabled={step === 0}
				onclick={() => goTo(step - 1)}
				class={step === 0 ? 'invisible' : ''}
			>
				<ChevronLeft class="size-4" />
				Back
			</Button>

			<span class="text-xs text-muted-foreground">
				Step {step + 1} of {STEPS.length}
			</span>

			{#if isLastStep}
				<Button type="submit" size="lg" class="px-8">
					{#if $delayed}
						<LoadingBtn name={s('donate.goods_sending', 'Recording your offer')} />
					{:else}
						<Package class="size-4" />
						{s('donate.goods_submit', 'Offer these goods')}
					{/if}
				</Button>
			{:else}
				<Button type="button" size="lg" class="px-8" onclick={next}>
					{s('donate.goods_next', 'Next')}
					<ChevronRight class="size-4" />
				</Button>
			{/if}
		</div>
	</form>
{/if}
