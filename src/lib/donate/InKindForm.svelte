<script lang="ts">
	import { superForm, type Infer, type SuperValidated } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Errors from '$lib/formComponents/Errors.svelte';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
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
	const { form, errors, enhance, delayed, message, allErrors } = superForm(formData, {
		id: 'in-kind',
		dataType: 'json',
		resetForm: false,
		taintedMessage: null
	});

	/** Set once the offer is recorded; the page then shows its reference. */
	let confirmation = $state<{ reference: string; summary: string } | null>(null);
	let photoNames = $state<string[]>([]);

	$effect(() => {
		if (!$message) return;
		if ($message.type === 'error') {
			toast.error($message.text);
		} else {
			toast.success($message.text);
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
	<div class="flex flex-col items-center gap-4 text-center">
		<div class="rounded-full bg-accent p-4 text-accent-foreground">
			<CircleCheck class="size-8" />
		</div>
		<h2 class="font-heading text-2xl font-semibold">Thank you</h2>
		<p class="text-muted-foreground">
			We have your offer of <strong>{confirmation.summary}</strong>. Someone will call to confirm
			what we are able to take and to arrange the handover — please hold on to everything until
			then.
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
	<form method="post" action="?/giftInKind" use:enhance class="flex flex-col gap-5">
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
										{option.name}{option.isAcceptingNow ? '' : ' — paused'}
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						{#if category?.description}
							<p class="text-xs text-muted-foreground">{category.description}</p>
						{/if}
					</div>

					<div class="flex flex-col gap-2">
						<Label for="description-{index}">Describe it</Label>
						<Input
							id="description-{index}"
							bind:value={item.description}
							placeholder="Children's winter coats"
						/>
					</div>

					<div class="grid gap-2 sm:grid-cols-2">
						<div class="flex flex-col gap-2">
							<Label for="quantity-{index}">How many</Label>
							<Input id="quantity-{index}" type="number" min="1" bind:value={item.quantity} />
						</div>
						<div class="flex flex-col gap-2">
							<Label for="unit-{index}">Counted in</Label>
							<Input
								id="unit-{index}"
								list="in-kind-units"
								bind:value={item.unit}
								placeholder="bags, boxes, kg…"
							/>
						</div>
					</div>

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

					<!-- Sizing, for anything that has to fit somebody. Driven by the
					     category, so a new clothing category asks these too. -->
					{#if category?.requiresSizing}
						<div class="grid gap-2 sm:grid-cols-2">
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
							<div class="flex flex-col gap-2 sm:col-span-2">
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
						<div class="grid gap-2 sm:grid-cols-2">
							<div class="flex flex-col gap-2">
								<Label for="expiresOn-{index}">Use by</Label>
								<Input id="expiresOn-{index}" type="date" bind:value={item.expiresOn} />
							</div>
							<div class="flex flex-col justify-end gap-2 pb-2">
								<label class="flex items-center gap-2 text-sm">
									<Checkbox bind:checked={item.needsRefrigeration} />
									Needs to stay cold
								</label>
								<label class="flex items-center gap-2 text-sm">
									<Checkbox bind:checked={item.isPerishable} />
									Spoils quickly
								</label>
							</div>
						</div>
					{/if}

					<div class="grid gap-2 sm:grid-cols-2">
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
					</div>

					<div class="flex flex-col gap-2">
						<Label for="notes-{index}">Anything else about it?</Label>
						<Input id="notes-{index}" bind:value={item.notes} placeholder="Optional" />
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
							<li>{note.name} — {note.note}</li>
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
				Optional, and the single most useful thing you can send — a photo answers most of what we
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

		<Separator />

		<!-- ==================== Getting hold of it ==================== -->
		<div class="flex flex-col gap-2">
			<Label>{s('donate.goods_handover', 'How should we take it from you?')}</Label>
			<div class="grid gap-2">
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
				Furniture and appliances are usually easier for us to collect — choose "please collect it" if
				that suits you better.
			</p>
		{/if}

		{#if $form.handoverMethod === 'pickup'}
			<div class="flex flex-col gap-3 rounded-2xl border bg-muted/30 p-4">
				<p class="text-sm font-medium">Where should we come?</p>

				<div class="grid gap-2 sm:grid-cols-2">
					<div class="flex flex-col gap-2">
						<Label for="pickupContactName">Who will be there?</Label>
						<Input
							id="pickupContactName"
							bind:value={$form.pickupContactName}
							placeholder="If it is not you"
						/>
					</div>
					<div class="flex flex-col gap-2">
						<Label for="pickupContactPhone">Their phone</Label>
						<Input id="pickupContactPhone" type="tel" bind:value={$form.pickupContactPhone} />
					</div>
				</div>

				<div class="flex flex-col gap-2">
					<Label for="pickupAddressLine">Address</Label>
					<Input id="pickupAddressLine" bind:value={$form.pickupAddressLine} />
					{#if $errors.pickupAddressLine}
						<p class="text-sm text-destructive">{$errors.pickupAddressLine}</p>
					{/if}
				</div>

				<div class="grid gap-2 sm:grid-cols-2">
					<div class="flex flex-col gap-2">
						<Label for="pickupCity">Town or sub-city</Label>
						<Input id="pickupCity" bind:value={$form.pickupCity} />
						{#if $errors.pickupCity}
							<p class="text-sm text-destructive">{$errors.pickupCity}</p>
						{/if}
					</div>
					<div class="flex flex-col gap-2">
						<Label for="pickupLandmark">Nearest landmark</Label>
						<Input
							id="pickupLandmark"
							bind:value={$form.pickupLandmark}
							placeholder="Behind the Total station"
						/>
					</div>
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

				<div class="flex flex-col gap-2">
					<Label for="accessNotes">Anything the driver should know?</Label>
					<Textarea
						id="accessNotes"
						rows={2}
						bind:value={$form.accessNotes}
						placeholder="Third floor, no lift. Gate locked after six."
					/>
				</div>
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

		<div class="grid gap-2 sm:grid-cols-2">
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
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={$form.requiresVehicle} />
					A vehicle will be needed
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={$form.requiresHelpLoading} />
					Help with lifting will be needed
				</label>
			</div>
		</div>

		<div class="grid gap-2 sm:grid-cols-2">
			<div class="flex flex-col gap-2">
				<Label for="availableFrom">Ready from</Label>
				<Input id="availableFrom" type="date" bind:value={$form.availableFrom} />
			</div>
			<div class="flex flex-col gap-2">
				<Label for="availableUntil">And available until</Label>
				<Input id="availableUntil" type="date" bind:value={$form.availableUntil} />
				{#if $errors.availableUntil}
					<p class="text-sm text-destructive">{$errors.availableUntil}</p>
				{/if}
			</div>
		</div>

		<Separator />

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

		<Separator />

		<!-- ==================== Who is giving ==================== -->
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

		{#if isOrganisation}
			<div class="flex flex-col gap-2">
				<Label for="organisationName">Name of the organisation</Label>
				<Input id="organisationName" bind:value={$form.organisationName} />
				{#if $errors.organisationName}
					<p class="text-sm text-destructive">{$errors.organisationName}</p>
				{/if}
			</div>
		{/if}

		<div class="flex flex-col gap-2">
			<Label for="in-kind-donorName">{s('donate.name', 'Your name')}</Label>
			<Input id="in-kind-donorName" bind:value={$form.donorName} required />
			{#if $errors.donorName}<p class="text-sm text-destructive">{$errors.donorName}</p>{/if}
		</div>

		<div class="grid gap-2 sm:grid-cols-2">
			<div class="flex flex-col gap-2">
				<Label for="in-kind-donorEmail">{s('donate.email', 'Email')}</Label>
				<Input id="in-kind-donorEmail" type="email" bind:value={$form.donorEmail} />
				{#if $errors.donorEmail}<p class="text-sm text-destructive">{$errors.donorEmail}</p>{/if}
			</div>
			<div class="flex flex-col gap-2">
				<Label for="in-kind-donorPhone">{s('donate.phone', 'Phone')}</Label>
				<Input id="in-kind-donorPhone" type="tel" bind:value={$form.donorPhone} />
				{#if $errors.donorPhone}<p class="text-sm text-destructive">{$errors.donorPhone}</p>{/if}
			</div>
		</div>

		<div class="grid gap-2 sm:grid-cols-2">
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
			<div class="flex flex-col gap-2">
				<Label for="bestTimeToContact">Best time</Label>
				<Input
					id="bestTimeToContact"
					bind:value={$form.bestTimeToContact}
					placeholder="Afternoons, after 6pm…"
				/>
			</div>
		</div>

		<Separator />

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
			<label class="flex items-center gap-2 text-sm">
				<Checkbox bind:checked={$form.hasRestrictedItems} />
				Some of it is medicine, or equipment with rules attached
			</label>
			{#if $form.hasRestrictedItems}
				<Textarea
					rows={2}
					bind:value={$form.restrictedItemsNote}
					placeholder="Tell us what, and where it came from — it decides whether we may accept it."
				/>
			{/if}

			<label class="flex items-center gap-2 text-sm">
				<Checkbox bind:checked={$form.receiptRequested} />
				Please send me a receipt
			</label>
			<label class="flex items-center gap-2 text-sm">
				<Checkbox bind:checked={$form.taxReceiptRequired} />
				I need a receipt valid for tax
			</label>
			{#if $form.taxReceiptRequired}
				<div class="flex flex-col gap-2">
					<Label for="taxIdNumber">TIN</Label>
					<Input id="taxIdNumber" bind:value={$form.taxIdNumber} />
					{#if $errors.taxIdNumber}
						<p class="text-sm text-destructive">{$errors.taxIdNumber}</p>
					{/if}
				</div>
			{/if}

			<label class="flex items-center gap-2 text-sm">
				<Checkbox bind:checked={$form.isAnonymous} />
				{s('donate.anonymous', 'Keep my gift anonymous')}
			</label>
			{#if !$form.isAnonymous}
				<div class="flex flex-col gap-2">
					<Label for="recognitionName">Name us to thank, if not your own</Label>
					<Input
						id="recognitionName"
						bind:value={$form.recognitionName}
						placeholder="The Abera family, or your company"
					/>
				</div>
			{/if}
		</div>

		<div class="flex flex-col gap-2">
			<Label for="in-kind-message">{s('donate.message', 'A message, if you would like')}</Label>
			<Textarea id="in-kind-message" rows={3} bind:value={$form.donorMessage} />
		</div>

		<div class="flex flex-col gap-2">
			<Label for="heardAbout">How did you hear about us?</Label>
			<Input id="heardAbout" bind:value={$form.heardAbout} placeholder="Optional" />
		</div>

		<div class="flex flex-col gap-2">
			<label class="flex items-center gap-2 text-sm">
				<Checkbox bind:checked={$form.isDiaspora} />
				{s('donate.is_diaspora', 'I am giving from outside Ethiopia')}
			</label>
			<label class="flex items-center gap-2 text-sm">
				<Checkbox bind:checked={$form.joinNewsletter} />
				{s('donate.newsletter', 'Send me occasional updates')}
			</label>
			<label class="flex items-start gap-2 text-sm">
				<Checkbox bind:checked={$form.consentToContact} class="mt-0.5" />
				<span>
					You may keep these details and contact me to arrange the handover.
					{#if $errors.consentToContact}
						<span class="block text-destructive">{$errors.consentToContact}</span>
					{/if}
				</span>
			</label>
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

		<Button type="submit" size="lg">
			{#if $delayed}
				<LoadingBtn name={s('donate.goods_sending', 'Recording your offer')} />
			{:else}
				<Package class="size-4" />
				{s('donate.goods_submit', 'Offer these goods')}
			{/if}
		</Button>
	</form>
{/if}
