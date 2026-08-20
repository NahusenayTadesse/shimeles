<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import PageHero from '$lib/content/PageHero.svelte';
	import BlockRenderer from '$lib/content/BlockRenderer.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Errors from '$lib/formComponents/Errors.svelte';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import {
		CircleCheck,
		Copy,
		HandHeart,
		Home,
		Languages as LanguagesIcon,
		LifeBuoy,
		Paperclip,
		Phone,
		ShieldCheck,
		UserRound
	} from '@lucide/svelte';
	import { URGENCY } from './schema';

	let { data } = $props();

	const s = (key: string, fallback: string) => data.strings?.[key] ?? fallback;

	/**
	 * `dataType: 'json'` because the chosen needs are an array of objects, each
	 * with its own detail, amount and urgency. Documents ride alongside as a
	 * plain file input read off the body on the server.
	 */
	const { form, errors, enhance, delayed, message, allErrors } = superForm(data.form, {
		dataType: 'json',
		resetForm: false,
		taintedMessage: null
	});

	let confirmation = $state<string | null>(null);
	let documentNames = $state<string[]>([]);

	$effect(() => {
		if (!$message) return;
		if ($message.type === 'error') {
			toast.error($message.text);
		} else {
			toast.success($message.text);
			confirmation = $message.reference ?? '';
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	});

	/* --- Needs -------------------------------------------------------------
	   The needs a person ticks are what routes the case, so the applicant does
	   not have to know which of four programmes owns their problem. */

	const needClaim = (needId: number) => $form.needs.find((claim) => claim.needId === needId);

	const toggleNeed = (needId: number) => {
		$form.needs = needClaim(needId)
			? $form.needs.filter((claim) => claim.needId !== needId)
			: [...$form.needs, { needId, detail: '', estimatedAmount: null, urgency: 'weeks' as const }];
	};

	const updateNeed = (needId: number, patch: Record<string, unknown>) => {
		$form.needs = $form.needs.map((claim) =>
			claim.needId === needId ? { ...claim, ...patch } : claim
		);
	};

	const URGENCY_LABELS: Record<string, string> = {
		whenever: 'Whenever you can',
		weeks: 'Within a few weeks',
		days: 'Within days',
		immediate: 'Right now — it is an emergency'
	};

	/** Needs are filtered by the chosen programme, if any. */
	const visibleGroups = $derived(
		data.catalog.needs
			.map((group) => ({
				...group,
				needs: group.needs.filter(
					(need) => !$form.pillarId || !need.pillarId || need.pillarId === $form.pillarId
				)
			}))
			.filter((group) => group.needs.length > 0)
	);

	/** Evidence hints for what they have actually ticked. */
	const evidenceHints = $derived(
		data.catalog.needs
			.flatMap((group) => group.needs)
			.filter((need) => needClaim(need.id) && need.evidenceHint)
			.map((need) => ({ name: need.name, hint: need.evidenceHint! }))
	);

	const GENDERS = [
		{ value: 'undisclosed', name: 'Prefer not to say' },
		{ value: 'female', name: 'Female' },
		{ value: 'male', name: 'Male' },
		{ value: 'other', name: 'Other' }
	];

	const genderLabel = $derived(
		GENDERS.find((option) => option.value === $form.subjectGender)?.name ?? 'Prefer not to say'
	);

	const chosenLanguage = $derived(
		data.catalog.languages.find((language) => language.id === $form.writtenLanguageId) ?? null
	);

	/** Whoever the form is about, for the section heading. */
	const subjectWord = $derived($form.applyingFor === 'self' ? 'you' : 'them');

	const onDocuments = (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		documentNames = [...(input.files ?? [])].map((file) => file.name);
	};

	const copyReference = async () => {
		if (!confirmation) return;
		await navigator.clipboard.writeText(confirmation);
		toast.success('Reference copied');
	};

	/** Body copy still comes from `content_blocks`; only the form is code. */
	const contentBlocks = $derived(
		(data.page?.blocks ?? []).filter((block) => block.type !== 'form_embed')
	);
</script>

<svelte:head>
	<title
		>{data.page?.title ?? 'Apply for support'} · {data.settings?.['site.name'] ??
			'Shimeles Abera Foundation'}</title
	>
	{#if data.page?.metaDescription}
		<meta name="description" content={data.page.metaDescription} />
	{/if}
</svelte:head>

<PageHero
	eyebrow={s('apply.eyebrow', 'Ask for help')}
	title={data.page?.title ?? 'Apply for support'}
	description={data.page?.metaDescription ??
		'For yourself, or for someone you are looking out for.'}
	image={data.page?.shareImage}
/>

<div class="mx-auto w-full max-w-4xl px-4 py-14 md:py-20">
	{#if confirmation !== null}
		<Card.Root class="flex flex-col items-center gap-4 p-10 text-center">
			<div class="rounded-full bg-accent p-4 text-accent-foreground">
				<CircleCheck class="size-8" />
			</div>
			<h2 class="font-heading text-2xl font-semibold">We have your application</h2>
			<p class="max-w-prose text-muted-foreground">
				Someone will read it and get in touch. If anything changes in the meantime — or if things
				get worse — please call us rather than waiting.
			</p>
			{#if confirmation}
				<button
					type="button"
					onclick={copyReference}
					class="flex items-center gap-2 rounded-full bg-muted px-5 py-3 font-mono text-lg font-semibold"
				>
					{confirmation}
					<Copy class="size-4 opacity-60" />
				</button>
				<p class="text-xs text-muted-foreground">
					Keep this reference. It is how we find your application when you call.
				</p>
			{/if}
			{#if data.settings?.['contact.phone_1']}
				<p class="text-sm">
					<Phone class="mr-1 inline size-4" />
					{data.settings['contact.phone_1']}
				</p>
			{/if}
		</Card.Root>
	{:else}
		{#if contentBlocks.length}
			<div class="mb-10 flex flex-col gap-8">
				<BlockRenderer
					blocks={contentBlocks}
					pillars={data.blocks?.pillars ?? []}
					initiatives={data.blocks?.initiatives ?? []}
					payments={data.blocks?.payments ?? []}
				/>
			</div>
		{/if}

		<!-- Said before anything is asked, because someone who cannot write
		     English should not have to read half a form to find that out. -->
		<Card.Root class="mb-6 border-primary/40 bg-primary/5 p-5">
			<div class="flex items-start gap-3">
				<LanguagesIcon class="mt-0.5 size-5 shrink-0 text-primary" />
				<div>
					<p class="font-medium">Write in whatever language you are comfortable in</p>
					<p class="mt-1 text-sm text-muted-foreground">
						Amharic, Afaan Oromo, Tigrinya, Somali, English — whichever you think in. Nobody is
						assessed on their writing, and we will find someone who reads it. Just tell us below
						which language you have used.
					</p>
				</div>
			</div>
		</Card.Root>

		<form
			method="post"
			action="?/apply"
			enctype="multipart/form-data"
			use:enhance
			class="flex flex-col gap-6"
		>
			<Errors allErrors={$allErrors} />

			<!-- Honeypot -->
			<div class="hidden" aria-hidden="true">
				<label for="website">Website</label>
				<input
					id="website"
					name="website"
					tabindex="-1"
					autocomplete="off"
					bind:value={$form.website}
				/>
			</div>

			<!-- ==================== Who is this for ==================== -->
			<Card.Root class="p-6 md:p-8">
				<div class="mb-5 flex items-center gap-3">
					<UserRound class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">Who is this for?</h2>
				</div>

				<div class="grid gap-3 sm:grid-cols-2">
					{#each [{ value: 'self', title: 'Myself', hint: 'I am the person who needs help.' }, { value: 'other', title: 'Someone else', hint: 'A relative, a neighbour, someone I look after.' }] as option (option.value)}
						<button
							type="button"
							onclick={() => ($form.applyingFor = option.value as 'self' | 'other')}
							aria-pressed={$form.applyingFor === option.value}
							class="rounded-lg border p-4 text-left transition hover:border-primary/60 {$form.applyingFor ===
							option.value
								? 'border-primary bg-primary/5 ring-1 ring-primary'
								: 'border-border'}"
						>
							<span class="block font-medium">{option.title}</span>
							<span class="mt-0.5 block text-sm text-muted-foreground">{option.hint}</span>
						</button>
					{/each}
				</div>

				<Separator class="my-6" />

				<div class="grid gap-5 md:grid-cols-2">
					<div class="flex flex-col gap-2">
						<Label for="applicantName">Your name</Label>
						<Input id="applicantName" bind:value={$form.applicantName} autocomplete="name" />
						{#if $errors.applicantName}
							<p class="text-sm text-destructive">{$errors.applicantName}</p>
						{/if}
					</div>

					{#if $form.applyingFor === 'other'}
						<div class="flex flex-col gap-2">
							<Label for="relationship">How do you know them?</Label>
							<Input
								id="relationship"
								bind:value={$form.relationship}
								placeholder="Daughter, neighbour, teacher…"
							/>
							{#if $errors.relationship}
								<p class="text-sm text-destructive">{$errors.relationship}</p>
							{/if}
						</div>
					{/if}

					<div class="flex flex-col gap-2">
						<Label for="applicantPhone">Your phone number</Label>
						<Input
							id="applicantPhone"
							type="tel"
							bind:value={$form.applicantPhone}
							autocomplete="tel"
						/>
						{#if $errors.applicantPhone}
							<p class="text-sm text-destructive">{$errors.applicantPhone}</p>
						{/if}
					</div>

					<div class="flex flex-col gap-2">
						<Label for="applicantEmail">Your email, if you have one</Label>
						<Input
							id="applicantEmail"
							type="email"
							bind:value={$form.applicantEmail}
							autocomplete="email"
						/>
						{#if $errors.applicantEmail}
							<p class="text-sm text-destructive">{$errors.applicantEmail}</p>
						{/if}
					</div>
				</div>
				<p class="mt-3 text-xs text-muted-foreground">
					A phone number or an email — one is enough. We need some way to come back to you.
				</p>
			</Card.Root>

			<!-- ==================== About the person ==================== -->
			<Card.Root class="p-6 md:p-8">
				<div class="mb-2 flex items-center gap-3">
					<Home class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">
						{$form.applyingFor === 'self' ? 'About you' : 'About the person you are applying for'}
					</h2>
				</div>
				<p class="mb-5 text-sm text-muted-foreground">
					Everything here is optional. Fill in what you know — an incomplete application is far
					better than none, and we can ask the rest when we speak.
				</p>

				<div class="grid gap-5 md:grid-cols-2">
					{#if $form.applyingFor === 'other'}
						<div class="flex flex-col gap-2">
							<Label for="subjectName">Their name</Label>
							<Input id="subjectName" bind:value={$form.subjectName} />
							{#if $errors.subjectName}
								<p class="text-sm text-destructive">{$errors.subjectName}</p>
							{/if}
						</div>

						<div class="flex flex-col gap-2">
							<Label for="subjectPhone">Their phone number</Label>
							<Input id="subjectPhone" type="tel" bind:value={$form.subjectPhone} />
						</div>
					{/if}

					<div class="flex flex-col gap-2">
						<Label for="subjectDateOfBirth">Date of birth</Label>
						<Input id="subjectDateOfBirth" type="date" bind:value={$form.subjectDateOfBirth} />
						{#if $errors.subjectDateOfBirth}
							<p class="text-sm text-destructive">{$errors.subjectDateOfBirth}</p>
						{/if}
					</div>

					<div class="flex flex-col gap-2">
						<Label for="subjectApproximateAge">Or roughly how old?</Label>
						<Input
							id="subjectApproximateAge"
							type="number"
							min="0"
							max="120"
							bind:value={$form.subjectApproximateAge}
							placeholder="If the exact date is not known"
						/>
					</div>

					<div class="flex flex-col gap-2">
						<Label>Gender</Label>
						<Select.Root
							type="single"
							value={$form.subjectGender}
							onValueChange={(value) => ($form.subjectGender = value as typeof $form.subjectGender)}
						>
							<Select.Trigger class="w-full">{genderLabel}</Select.Trigger>
							<Select.Content>
								{#each GENDERS as option (option.value)}
									<Select.Item value={option.value}>{option.name}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<div class="flex flex-col gap-2">
						<Label for="city">Where do {subjectWord} live?</Label>
						<Input id="city" bind:value={$form.city} placeholder="Sub-city, town or kebele" />
					</div>

					<div class="flex flex-col gap-2 md:col-span-2">
						<Label for="addressLine">Address, if you can give one</Label>
						<Input
							id="addressLine"
							bind:value={$form.addressLine}
							placeholder="Enough for us to find the house if we visit"
						/>
					</div>

					{#if data.catalog.regions.length > 1}
						<div class="flex flex-col gap-2">
							<Label>Region</Label>
							<Select.Root
								type="single"
								value={$form.regionId ? String($form.regionId) : ''}
								onValueChange={(value) => ($form.regionId = value ? Number(value) : null)}
							>
								<Select.Trigger class="w-full">
									{data.catalog.regions.find((region) => region.id === $form.regionId)?.name ??
										'Choose a region'}
								</Select.Trigger>
								<Select.Content>
									{#each data.catalog.regions as region (region.id)}
										<Select.Item value={String(region.id)}>{region.name}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					{/if}

					<div class="flex flex-col gap-2">
						<Label for="householdSize">How many people live in the household?</Label>
						<Input
							id="householdSize"
							type="number"
							min="1"
							max="40"
							bind:value={$form.householdSize}
						/>
					</div>

					<div class="flex flex-col gap-2">
						<Label for="dependantsCount">How many of them are children or dependants?</Label>
						<Input
							id="dependantsCount"
							type="number"
							min="0"
							max="40"
							bind:value={$form.dependantsCount}
						/>
					</div>

					<div class="flex flex-col gap-2">
						<Label for="monthlyIncome">Household income each month (birr)</Label>
						<Input
							id="monthlyIncome"
							type="number"
							min="0"
							bind:value={$form.monthlyIncome}
							placeholder="A rough figure is fine"
						/>
					</div>

					<div class="flex flex-col gap-2">
						<Label for="incomeSource">Where does that income come from?</Label>
						<Input
							id="incomeSource"
							bind:value={$form.incomeSource}
							placeholder="Daily work, a pension, family sending money…"
						/>
					</div>
				</div>

				<Separator class="my-6" />

				<div class="grid gap-5 md:grid-cols-2">
					<div class="flex flex-col gap-2">
						<Label>Is there a disability or long-term illness?</Label>
						<div class="flex gap-2">
							<Button
								type="button"
								size="sm"
								variant={$form.hasDisability === false ? 'default' : 'outline'}
								onclick={() => ($form.hasDisability = false)}
							>
								No
							</Button>
							<Button
								type="button"
								size="sm"
								variant={$form.hasDisability === true ? 'default' : 'outline'}
								onclick={() => ($form.hasDisability = true)}
							>
								Yes
							</Button>
						</div>
					</div>

					<div class="flex flex-col gap-2">
						<Label>Is anyone in the household working?</Label>
						<div class="flex gap-2">
							<Button
								type="button"
								size="sm"
								variant={$form.isEmployed === false ? 'default' : 'outline'}
								onclick={() => ($form.isEmployed = false)}
							>
								No
							</Button>
							<Button
								type="button"
								size="sm"
								variant={$form.isEmployed === true ? 'default' : 'outline'}
								onclick={() => ($form.isEmployed = true)}
							>
								Yes
							</Button>
						</div>
					</div>

					{#if $form.hasDisability === true}
						<div class="flex flex-col gap-2 md:col-span-2">
							<Label for="healthDetail">If you are willing to say more about it</Label>
							<Textarea id="healthDetail" rows={3} bind:value={$form.healthDetail} />
						</div>
					{/if}

					<div class="flex flex-col gap-2 md:col-span-2">
						<Label for="otherSupport">
							Are {subjectWord} getting help from anywhere else at the moment?
						</Label>
						<Textarea
							id="otherSupport"
							rows={2}
							bind:value={$form.otherSupport}
							placeholder="Another charity, a government programme, family — so we add to it rather than repeat it"
						/>
					</div>
				</div>
			</Card.Root>

			<!-- ==================== What is needed ==================== -->
			<Card.Root class="p-6 md:p-8">
				<div class="mb-2 flex items-center gap-3">
					<LifeBuoy class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">What do you need?</h2>
				</div>
				<p class="mb-5 text-sm text-muted-foreground">
					Tick anything that applies. If none of it fits, leave them all and just write to us below
					— we read every application either way.
				</p>

				{#if data.catalog.pillars.length}
					<div class="mb-6 flex flex-col gap-2">
						<Label>Which programme, if you know?</Label>
						<div class="flex flex-wrap gap-2">
							<Button
								type="button"
								size="sm"
								variant={$form.pillarId === null ? 'default' : 'outline'}
								onclick={() => ($form.pillarId = null)}
							>
								I am not sure
							</Button>
							{#each data.catalog.pillars as pillar (pillar.id)}
								<Button
									type="button"
									size="sm"
									variant={$form.pillarId === pillar.id ? 'default' : 'outline'}
									onclick={() => ($form.pillarId = pillar.id)}
								>
									<DynamicIcon name={pillar.icon} class="size-4" />
									{pillar.name}
								</Button>
							{/each}
						</div>
						<p class="text-xs text-muted-foreground">
							Not knowing is fine — we work it out from what you tell us.
						</p>
					</div>
				{/if}

				<div class="flex flex-col gap-6">
					{#each visibleGroups as group (group.id ?? group.name)}
						<div>
							<div class="mb-3 flex items-center gap-2">
								{#if group.icon}
									<DynamicIcon name={group.icon} class="size-4 text-muted-foreground" />
								{/if}
								<h3 class="font-medium">{group.name}</h3>
							</div>

							<div class="grid gap-2 sm:grid-cols-2">
								{#each group.needs as need (need.id)}
									{@const claim = needClaim(need.id)}
									<div
										class="rounded-lg border p-3 transition {claim
											? 'border-primary/60 bg-primary/5'
											: 'border-border'}"
									>
										<label class="flex cursor-pointer items-start gap-3">
											<Checkbox
												checked={Boolean(claim)}
												onCheckedChange={() => toggleNeed(need.id)}
												class="mt-0.5"
											/>
											<span class="min-w-0">
												<span class="block text-sm font-medium">{need.name}</span>
												{#if need.description}
													<span class="mt-0.5 block text-xs text-muted-foreground">
														{need.description}
													</span>
												{/if}
											</span>
										</label>

										{#if claim}
											<div class="mt-3 flex flex-col gap-2 pl-7">
												<Input
													value={claim.detail ?? ''}
													oninput={(event) =>
														updateNeed(need.id, {
															detail: (event.currentTarget as HTMLInputElement).value
														})}
													placeholder="Anything specific?"
													class="h-8 text-xs"
												/>
												<div class="flex gap-2">
													<Input
														type="number"
														min="0"
														value={claim.estimatedAmount ?? ''}
														oninput={(event) => {
															const raw = (event.currentTarget as HTMLInputElement).value;
															updateNeed(need.id, {
																estimatedAmount: raw === '' ? null : Number(raw)
															});
														}}
														placeholder="Birr, if you know"
														class="h-8 text-xs"
													/>
													<Select.Root
														type="single"
														value={claim.urgency}
														onValueChange={(value) => updateNeed(need.id, { urgency: value })}
													>
														<Select.Trigger class="h-8 flex-1 text-xs">
															{URGENCY_LABELS[claim.urgency]}
														</Select.Trigger>
														<Select.Content>
															{#each URGENCY as level (level)}
																<Select.Item value={level}>{URGENCY_LABELS[level]}</Select.Item>
															{/each}
														</Select.Content>
													</Select.Root>
												</div>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>

				<Separator class="my-6" />

				<div class="flex flex-col gap-2">
					<Label for="story">Tell us what is happening</Label>
					<p class="text-sm text-muted-foreground">
						In your own words, in your own language. There is no right way to write this.
					</p>
					<Textarea id="story" rows={7} bind:value={$form.story} />
					{#if $errors.story}<p class="text-sm text-destructive">{$errors.story}</p>{/if}
				</div>

				{#if data.catalog.languages.length}
					<div class="mt-5 flex flex-col gap-2">
						<Label>Which language did you write that in?</Label>
						<div class="flex flex-wrap gap-2">
							{#each data.catalog.languages as language (language.id)}
								<Button
									type="button"
									size="sm"
									variant={$form.writtenLanguageId === language.id ? 'default' : 'outline'}
									onclick={() => ($form.writtenLanguageId = language.id)}
								>
									{language.nativeName ?? language.name}
								</Button>
							{/each}
						</div>
						{#if chosenLanguage}
							<p class="text-xs text-muted-foreground">
								We will make sure someone who reads {chosenLanguage.name} handles this.
							</p>
						{/if}
					</div>
				{/if}
			</Card.Root>

			<!-- ==================== Documents ==================== -->
			<Card.Root class="p-6 md:p-8">
				<div class="mb-2 flex items-center gap-3">
					<Paperclip class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">Anything that supports this?</h2>
				</div>
				<p class="mb-4 text-sm text-muted-foreground">
					A medical letter, a school report, a prescription, a photograph of a document. Optional —
					send what you have, and nothing if you have nothing. Up to six files.
				</p>

				{#if evidenceHints.length}
					<div class="mb-4 rounded-lg border border-dashed p-3">
						<p class="mb-1 text-xs font-medium">Helpful for what you ticked:</p>
						<ul class="ml-4 list-disc text-xs text-muted-foreground">
							{#each evidenceHints as hint (hint.name)}
								<li>{hint.name} — {hint.hint}</li>
							{/each}
						</ul>
					</div>
				{/if}

				<Input
					type="file"
					name="documents"
					multiple
					accept="image/*,.pdf,.doc,.docx,.txt"
					onchange={onDocuments}
				/>

				{#if documentNames.length}
					<div class="mt-3 flex flex-wrap gap-2">
						{#each documentNames as name (name)}
							<Badge variant="secondary">{name}</Badge>
						{/each}
					</div>
				{/if}
			</Card.Root>

			<!-- ==================== Reaching you ==================== -->
			<Card.Root class="p-6 md:p-8">
				<div class="mb-5 flex items-center gap-3">
					<Phone class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">How should we reach you?</h2>
				</div>

				<div class="grid gap-5 md:grid-cols-2">
					<div class="flex flex-col gap-2">
						<Label for="bestTimeToContact">Best time to call</Label>
						<Input
							id="bestTimeToContact"
							bind:value={$form.bestTimeToContact}
							placeholder="Mornings, after 6pm, weekends…"
						/>
					</div>

					<div class="flex flex-col gap-2">
						<Label for="alternateContactName">Someone else we can call</Label>
						<Input
							id="alternateContactName"
							bind:value={$form.alternateContactName}
							placeholder="If we cannot reach you"
						/>
					</div>

					<div class="flex flex-col gap-2">
						<Label for="alternateContactPhone">Their number</Label>
						<Input id="alternateContactPhone" type="tel" bind:value={$form.alternateContactPhone} />
					</div>
				</div>

				<Separator class="my-6" />

				<!-- Not politeness. Someone applying about a family situation or a
				     mental health crisis may not be safe to ring at home, and a
				     caseworker has to know that before they dial. -->
				<label class="flex items-start gap-3">
					<Checkbox
						checked={!$form.safeToContact}
						onCheckedChange={(checked) => ($form.safeToContact = checked !== true)}
						class="mt-0.5"
					/>
					<span class="text-sm">
						Please be careful how you contact me — it may not be safe or private to call at any
						time.
					</span>
				</label>

				{#if !$form.safeToContact}
					<div class="mt-3 flex flex-col gap-2">
						<Label for="contactNotes">What should we know before we get in touch?</Label>
						<Textarea id="contactNotes" rows={2} bind:value={$form.contactNotes} />
					</div>
				{/if}
			</Card.Root>

			<!-- ==================== Consent ==================== -->
			<Card.Root class="p-6 md:p-8">
				<div class="mb-5 flex items-center gap-3">
					<ShieldCheck class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">Before you send it</h2>
				</div>

				<div class="flex flex-col gap-4">
					<label class="flex items-start gap-3">
						<Checkbox
							checked={$form.consentToStore}
							onCheckedChange={(checked) => ($form.consentToStore = checked === true)}
							class="mt-0.5"
						/>
						<span class="text-sm">
							I agree that the Foundation may keep this application and the details in it in order
							to assess it. See the
							<a href="/privacy" class="underline underline-offset-2">privacy policy</a>.
						</span>
					</label>
					{#if $errors.consentToStore}
						<p class="text-sm text-destructive">{$errors.consentToStore}</p>
					{/if}

					<label class="flex items-start gap-3">
						<Checkbox
							checked={$form.consentToVerify}
							onCheckedChange={(checked) => ($form.consentToVerify = checked === true)}
							class="mt-0.5"
						/>
						<span class="text-sm">
							I agree that the Foundation may check what I have said — with a hospital, a school, or
							by visiting. Optional; it usually makes the assessment faster.
						</span>
					</label>
				</div>

				<Separator class="my-6" />

				<div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
					<p class="text-sm text-muted-foreground">
						{#if data.settings?.['contact.phone_1']}
							If this is an emergency, call {data.settings['contact.phone_1']} rather than waiting for
							a reply.
						{:else}
							If this is an emergency, please call us rather than waiting for a reply.
						{/if}
					</p>
					<Button type="submit" size="lg" disabled={$delayed}>
						{#if $delayed}
							<LoadingBtn name="Sending" />
						{:else}
							<HandHeart class="size-4" />
							Send my application
						{/if}
					</Button>
				</div>
			</Card.Root>
		</form>
	{/if}
</div>
