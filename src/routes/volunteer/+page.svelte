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
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import Errors from '$lib/formComponents/Errors.svelte';
	import { focusFirstError } from '$lib/formComponents/form-errors';
	import { formDraft } from '$lib/formComponents/form-draft.svelte';
	import DraftBanner from '$lib/formComponents/DraftBanner.svelte';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import InputComp from '$lib/formComponents/InputComp.svelte';
	import CheckboxField from '$lib/formComponents/CheckboxField.svelte';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import {
		CalendarClock,
		CircleCheck,
		Copy,
		HeartHandshake,
		Plus,
		ShieldCheck,
		Sparkles,
		Trash2,
		UserRound
	} from '@lucide/svelte';
	import { PROFICIENCY } from './schema';
	import { genderLabel } from '$lib/gender';

	let { data } = $props();

	const s = (key: string, fallback: string) => data.strings?.[key] ?? fallback;

	const SECTIONS = $derived(
		[
			{ id: 'section-about', label: 'About you' },
			{ id: 'section-programmes', label: 'Programmes' },
			data.catalog.skills.length ? { id: 'section-skills', label: 'Skills' } : null,
			{ id: 'section-availability', label: 'Availability' },
			{ id: 'section-credentials', label: 'Credentials' },
			{ id: 'section-references', label: 'References' },
			{ id: 'section-consent', label: 'Consent' }
		].filter((section) => section !== null)
	);
	let activeSection = $state('section-about');

	const observeSections = (node: HTMLElement) => {
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
				if (visible) activeSection = visible.target.id;
			},
			{ rootMargin: '-15% 0px -70% 0px' }
		);
		for (const section of SECTIONS) {
			const el = node.querySelector(`#${section.id}`);
			if (el) observer.observe(el);
		}
		return { destroy: () => observer.disconnect() };
	};

	/**
	 * `dataType: 'json'` because the form posts nested arrays — chosen skills
	 * with a proficiency each, a variable number of credentials, two or more
	 * references. Flattening those into indexed field names to keep a no-JS
	 * post working would make the schema unreadable for a form that already
	 * needs JavaScript to add a credential row at all.
	 */
	const { form, errors, enhance, delayed, message, allErrors, tainted } = superForm(data.form, {
		dataType: 'json',
		resetForm: false,
		taintedMessage: 'You have not finished this form. Leave anyway?'
	});

	/** Set once the application is stored; the page then shows the reference. */
	let confirmation = $state<string | null>(null);

	/*
	 * A draft of this form, kept on this device only.
	 *
	 * Saved on a debounce as the person types and offered back behind a banner
	 * — never applied on its own. Cleared the moment the form is submitted, so
	 * a finished application does not sit in the browser afterwards.
	 */
	const draft = formDraft('volunteer');

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
				confirmation = $message.reference;
				window.scrollTo({ top: 0, behavior: 'smooth' });
			}
		}
	});

	/* --- Programmes ------------------------------------------------------- */

	const togglePillar = (id: number) => {
		$form.pillarIds = $form.pillarIds.includes(id)
			? $form.pillarIds.filter((pillarId) => pillarId !== id)
			: [...$form.pillarIds, id];
	};

	/* --- Skills ------------------------------------------------------------
	   A skill is a catalogue row, so this only ever moves ids around. The
	   proficiency select appears once a skill is ticked — asking how good
	   someone is at something they have not claimed is noise. */

	const skillClaim = (skillId: number) => $form.skills.find((claim) => claim.skillId === skillId);

	const toggleSkill = (skillId: number) => {
		$form.skills = skillClaim(skillId)
			? $form.skills.filter((claim) => claim.skillId !== skillId)
			: [...$form.skills, { skillId, proficiency: 'intermediate' as const }];
	};

	const setProficiency = (skillId: number, proficiency: string) => {
		$form.skills = $form.skills.map((claim) =>
			claim.skillId === skillId
				? { ...claim, proficiency: proficiency as (typeof PROFICIENCY)[number] }
				: claim
		);
	};

	const PROFICIENCY_LABELS: Record<string, string> = {
		basic: 'Some experience',
		intermediate: 'Confident',
		advanced: 'Very experienced',
		professional: 'This is my profession'
	};

	/**
	 * Skills the catalogue marks as needing a credential. Ticking one is what
	 * opens the credentials section — a volunteer who says they can do clinical
	 * counselling is telling us they are a professional, whether or not they
	 * then tick the box that says so.
	 */
	const credentialSkills = $derived(
		data.catalog.skills.flatMap((group) => group.skills).filter((skill) => skill.requiresCredential)
	);

	const claimsCredentialSkill = $derived(
		credentialSkills.some((skill) => Boolean(skillClaim(skill.id)))
	);

	$effect(() => {
		// One-way: ticking a professional skill turns the section on. Turning it
		// off again is the volunteer's own choice to make, and untickng the skill
		// is how they do it.
		if (claimsCredentialSkill && !$form.isProfessional) $form.isProfessional = true;
	});

	/* --- Availability ------------------------------------------------------ */

	/** Two example lines, so the "one per line" instruction is shown not just said. */
	const OTHER_SKILLS_PLACEHOLDER = 'Sign language\nMinibus driving';

	const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	/** Slots grouped by weekday, with dayless slots ("on call") kept last. */
	const slotGroups = $derived.by(() => {
		const days = [...new Set(data.catalog.timeSlots.map((slot) => slot.dayOfWeek))].sort(
			(a, b) => (a ?? 99) - (b ?? 99)
		);
		return days.map((day) => ({
			label: day === null ? 'Any time' : DAY_NAMES[day],
			slots: data.catalog.timeSlots.filter((slot) => slot.dayOfWeek === day)
		}));
	});

	const toggleSlot = (id: number) => {
		$form.timeSlotIds = $form.timeSlotIds.includes(id)
			? $form.timeSlotIds.filter((slotId) => slotId !== id)
			: [...$form.timeSlotIds, id];
	};

	const slotTime = (slot: { startTime: string | null; endTime: string | null }) =>
		slot.startTime && slot.endTime ? `${slot.startTime}–${slot.endTime}` : null;

	/* --- Credentials ------------------------------------------------------- */

	const blankCredential = () => ({
		professionId: null,
		otherProfession: '',
		licenseNumber: '',
		licensingBody: '',
		specialization: '',
		yearsExperience: null,
		issuedOn: '',
		expiresOn: ''
	});

	const addCredential = () => ($form.credentials = [...$form.credentials, blankCredential()]);

	const removeCredential = (index: number) => {
		$form.credentials = $form.credentials.filter((_, position) => position !== index);
	};

	$effect(() => {
		// The section is never shown empty: saying "yes, I am a professional" and
		// being given nothing to fill in is a dead end.
		if ($form.isProfessional && $form.credentials.length === 0) addCredential();
	});

	/** Pre-fills the licensing body from the profession the applicant picked. */
	const setProfession = (index: number, value: string) => {
		const professionId = value ? Number(value) : null;
		const profession = data.catalog.professions.find((row) => row.id === professionId);
		$form.credentials = $form.credentials.map((credential, position) =>
			position === index
				? {
						...credential,
						professionId,
						licensingBody: credential.licensingBody || profession?.defaultLicensingBody || ''
					}
				: credential
		);
	};

	/* --- References -------------------------------------------------------- */

	const addReference = () => {
		$form.references = [
			...$form.references,
			{ fullName: '', relationship: '', organization: '', email: '', phone: '' }
		];
	};

	const removeReference = (index: number) => {
		$form.references = $form.references.filter((_, position) => position !== index);
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
		>{data.page?.title ?? 'Volunteer'} · {data.settings?.['site.name'] ??
			'Shimeles Abera Foundation'}</title
	>
	{#if data.page?.metaDescription}
		<meta name="description" content={data.page.metaDescription} />
	{/if}
</svelte:head>

<PageHero
	eyebrow={s('volunteer.eyebrow', 'Give your time')}
	title={data.page?.title ?? 'Volunteer with us'}
	description={data.page?.metaDescription}
	image={data.page?.shareImage}
/>

<div class="mx-auto w-full max-w-5xl px-4 py-14 md:py-20">
	{#if confirmation}
		<Card.Root class="flex flex-col items-center gap-4 p-10 text-center">
			<div class="rounded-full bg-accent p-4 text-accent-foreground">
				<CircleCheck class="size-8" />
			</div>
			<h2 class="font-heading text-2xl font-semibold">Thank you for offering</h2>
			<p class="max-w-prose text-muted-foreground">
				We have your application. Because our volunteers meet people at vulnerable moments, every
				application goes through a safeguarding review before placement. We will be in touch about
				the next step.
			</p>
			<button
				type="button"
				onclick={copyReference}
				class="flex items-center gap-2 rounded-full bg-muted px-5 py-3 font-mono text-lg font-semibold"
			>
				{confirmation}
				<Copy class="size-4 opacity-60" />
			</button>
			<p class="text-xs text-muted-foreground">
				Keep this reference. It is how we find you if you get in touch.
			</p>
		</Card.Root>
	{:else}
		{#if contentBlocks.length}
			<div class="mb-12 flex flex-col gap-8">
				<BlockRenderer
					blocks={contentBlocks}
					pillars={data.blocks?.pillars ?? []}
					initiatives={data.blocks?.initiatives ?? []}
					payments={data.blocks?.payments ?? []}
					initiativeNotice={data.settings?.['initiatives.disclaimer'] ?? ''}
				/>
			</div>
		{/if}

		<div
			class="sticky top-[89px] z-10 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border"
		>
			{#each SECTIONS as section, index (section.id)}
				<a
					href="#{section.id}"
					class="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition {activeSection ===
					section.id
						? 'bg-primary text-primary-foreground'
						: 'text-muted-foreground hover:bg-muted'}"
				>
					{index + 1}. {section.label}
				</a>
			{/each}
		</div>

		<form
			method="post"
			action="?/apply"
			use:enhance
			use:observeSections
			class="flex flex-col gap-8"
		>
			{#if draft.available}
				<DraftBanner
					savedAt={draft.savedAt}
					onrestore={restoreDraft}
					ondiscard={() => draft.discard()}
				/>
			{/if}

			<Errors allErrors={$allErrors} />

			<!-- Honeypot. Hidden from people, irresistible to bots; a filled value
			     is accepted silently and stored nowhere. -->
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

			<!-- ============================ About you ======================== -->
			<Card.Root id="section-about" class="scroll-mt-[145px] p-6 md:p-8">
				<div class="mb-6 flex items-center gap-3">
					<UserRound class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">About you</h2>
				</div>

				<div class="grid gap-5 md:grid-cols-2">
					<InputComp
						{errors}
						bind:value={$form.fullName}
						name="fullName"
						label="Full name"
						type="text"
						autocomplete="name"
						showRequired
						labelClass=""
					/>

					<InputComp
						{errors}
						bind:value={$form.phone}
						name="phone"
						label="Phone number"
						type="tel"
						autocomplete="tel"
						showRequired
						labelClass=""
					/>

					<InputComp
						{errors}
						bind:value={$form.email}
						name="email"
						label="Email address"
						type="email"
						autocomplete="email"
						showRequired
						labelClass=""
					/>

					<InputComp
						{errors}
						bind:value={$form.city}
						name="city"
						label="Where do you live?"
						type="text"
						placeholder="Sub-city, or the nearest town"
						labelClass=""
					/>

					<InputComp
						{errors}
						bind:value={$form.dateOfBirth}
						name="dateOfBirth"
						label="Date of birth"
						type="date"
						labelClass=""
					/>

					<InputComp
						{errors}
						bind:value={$form.occupation}
						name="occupation"
						label="What do you do?"
						type="text"
						placeholder="Your work or studies"
						labelClass=""
					/>

					<InputComp
						{errors}
						bind:value={$form.organisationName}
						name="organisationName"
						label="Organisation, if you are applying through one"
						type="text"
						placeholder="An employer, university or association"
						labelClass=""
					/>

					<!-- `city` and the region are Ethiopian geography, so a volunteer
					     writing in from abroad has nowhere else to say where they are. -->
					<InputComp
						{errors}
						bind:value={$form.country}
						name="country"
						label="Country"
						type="text"
						placeholder="Ethiopia, unless you are applying from abroad"
						autocomplete="country-name"
						labelClass=""
					/>

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
						<Label>Gender</Label>
						<Select.Root
							type="single"
							value={$form.gender ?? ''}
							onValueChange={(value) => ($form.gender = (value || null) as typeof $form.gender)}
						>
							<Select.Trigger class="w-full">
								{genderLabel($form.gender)}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="female">Female</Select.Item>
								<Select.Item value="male">Male</Select.Item>
								<Select.Item value="other">Other</Select.Item>
								<Select.Item value="prefer_not_to_say">Prefer not to say</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>
				</div>

				<div class="my-2" aria-hidden="true"></div>

				<div class="mb-4">
					<h3 class="font-medium">Emergency contact</h3>
					<p class="text-sm text-muted-foreground">
						One person we can call if something happens while you are with us.
					</p>
				</div>

				<div class="grid gap-5 md:grid-cols-3">
					<div class="flex flex-col gap-2">
						<Label for="emergencyContactName"
							>Their name <span class="text-destructive">*</span></Label
						>
						<Input id="emergencyContactName" bind:value={$form.emergencyContactName} />
						{#if $errors.emergencyContactName}
							<p class="text-sm text-destructive">{$errors.emergencyContactName}</p>
						{/if}
					</div>
					<div class="flex flex-col gap-2">
						<Label for="emergencyContactPhone"
							>Their phone number <span class="text-destructive">*</span></Label
						>
						<Input id="emergencyContactPhone" type="tel" bind:value={$form.emergencyContactPhone} />
						{#if $errors.emergencyContactPhone}
							<p class="text-sm text-destructive">{$errors.emergencyContactPhone}</p>
						{/if}
					</div>
					<InputComp
						{errors}
						bind:value={$form.emergencyContactRelationship}
						name="emergencyContactRelationship"
						label="Relationship to you"
						type="text"
						placeholder="Spouse, parent, friend"
						labelClass=""
					/>
				</div>
			</Card.Root>

			<!-- ========================= Programmes ========================== -->
			<Card.Root id="section-programmes" class="scroll-mt-[145px] p-6 md:p-8">
				<div class="mb-2 flex items-center gap-3">
					<HeartHandshake class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">
						Where would you like to help? <span class="text-destructive">*</span>
					</h2>
				</div>
				<p class="mb-5 text-sm text-muted-foreground">
					Choose as many as you like. It does not lock you in.
				</p>

				<div class="grid gap-3 sm:grid-cols-2">
					{#each data.catalog.pillars as pillar (pillar.id)}
						{@const chosen = $form.pillarIds.includes(pillar.id)}
						<button
							type="button"
							onclick={() => togglePillar(pillar.id)}
							aria-pressed={chosen}
							class="flex items-start gap-3 rounded-lg border p-4 text-left transition hover:border-primary/60 {chosen
								? 'border-primary bg-primary/5 ring-1 ring-primary'
								: 'border-border'}"
						>
							<Checkbox checked={chosen} tabindex={-1} class="pointer-events-none mt-0.5" />
							<span class="min-w-0">
								<span class="block font-medium">{pillar.name}</span>
								{#if pillar.summary}
									<span class="mt-0.5 block text-sm text-muted-foreground">{pillar.summary}</span>
								{/if}
							</span>
						</button>
					{/each}
				</div>
				{#if $errors.pillarIds}
					<p class="mt-3 text-sm text-destructive">{$errors.pillarIds}</p>
				{/if}
			</Card.Root>

			<!-- =========================== Skills ============================ -->
			{#if data.catalog.skills.length}
				<Card.Root id="section-skills" class="scroll-mt-[145px] p-6 md:p-8">
					<div class="mb-2 flex items-center gap-3">
						<Sparkles class="size-5 text-primary" />
						<h2 class="font-heading text-xl font-semibold">What can you bring?</h2>
					</div>
					<p class="mb-6 text-sm text-muted-foreground">
						Tick anything you could genuinely be asked to do. Nothing here is a commitment.
					</p>

					<div class="flex flex-col gap-7">
						{#each data.catalog.skills as group (group.id ?? group.name)}
							<div>
								<div class="mb-3 flex items-center gap-2">
									{#if group.icon}
										<DynamicIcon name={group.icon} class="size-4 text-muted-foreground" />
									{/if}
									<h3 class="font-medium">{group.name}</h3>
								</div>
								{#if group.description}
									<p class="mb-3 text-sm text-muted-foreground">{group.description}</p>
								{/if}

								<div class="grid gap-2 sm:grid-cols-2">
									{#each group.skills as skill (skill.id)}
										{@const claim = skillClaim(skill.id)}
										<div
											class="rounded-lg border p-3 transition {claim
												? 'border-primary/60 bg-primary/5'
												: 'border-border'}"
										>
											<label class="flex cursor-pointer items-start gap-3">
												<Checkbox
													checked={Boolean(claim)}
													onCheckedChange={() => toggleSkill(skill.id)}
													class="mt-0.5"
												/>
												<span class="min-w-0">
													<span class="block text-sm font-medium">
														{skill.name}
														{#if skill.requiresCredential}
															<Badge variant="outline" class="ml-1 align-middle text-[10px]">
																licence needed
															</Badge>
														{/if}
													</span>
													{#if skill.hint}
														<span class="mt-0.5 block text-xs text-muted-foreground">
															{skill.hint}
														</span>
													{/if}
												</span>
											</label>

											{#if claim}
												<div class="mt-3 pl-7">
													<Select.Root
														type="single"
														value={claim.proficiency}
														onValueChange={(value) => setProficiency(skill.id, value)}
													>
														<Select.Trigger class="h-8 w-full text-xs">
															{PROFICIENCY_LABELS[claim.proficiency]}
														</Select.Trigger>
														<Select.Content>
															{#each PROFICIENCY as level (level)}
																<Select.Item value={level}>{PROFICIENCY_LABELS[level]}</Select.Item>
															{/each}
														</Select.Content>
													</Select.Root>
												</div>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>

					<div class="my-2" aria-hidden="true"></div>

					<div class="flex flex-col gap-2">
						<Label for="otherSkills">Anything else? One per line.</Label>
						<Textarea
							id="otherSkills"
							rows={3}
							bind:value={$form.otherSkills}
							placeholder={OTHER_SKILLS_PLACEHOLDER}
						/>
					</div>
				</Card.Root>
			{/if}

			<!-- ========================= Availability ========================= -->
			<Card.Root id="section-availability" class="scroll-mt-[145px] p-6 md:p-8">
				<div class="mb-2 flex items-center gap-3">
					<CalendarClock class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">
						When are you usually free? <span class="text-destructive">*</span>
					</h2>
				</div>
				<p class="mb-6 text-sm text-muted-foreground">
					Rough is fine. We use this to match you to work that actually happens when you are around.
				</p>

				{#if data.catalog.timeSlots.length}
					<div class="flex flex-col gap-5">
						{#each slotGroups as group (group.label)}
							<div>
								<h3 class="mb-2 text-sm font-medium text-muted-foreground">{group.label}</h3>
								<div class="flex flex-wrap gap-2">
									{#each group.slots as slot (slot.id)}
										{@const chosen = $form.timeSlotIds.includes(slot.id)}
										<button
											type="button"
											onclick={() => toggleSlot(slot.id)}
											aria-pressed={chosen}
											title={slot.description ?? undefined}
											class="rounded-full border px-4 py-2 text-sm transition {chosen
												? 'border-primary bg-primary text-primary-foreground'
												: 'border-border hover:border-primary/60'}"
										>
											{slot.label}
											{#if slotTime(slot)}
												<span class="ml-1 opacity-70">{slotTime(slot)}</span>
											{/if}
										</button>
									{/each}
								</div>
							</div>
						{/each}
					</div>
					{#if $errors.timeSlotIds}
						<p class="mt-3 text-sm text-destructive">{$errors.timeSlotIds}</p>
					{/if}
				{/if}

				<div class="mt-7 grid gap-5 md:grid-cols-3">
					<div class="flex flex-col gap-2">
						<Label for="hoursPerWeek">Hours a week</Label>
						<Input
							id="hoursPerWeek"
							type="number"
							min="1"
							max="60"
							bind:value={$form.hoursPerWeek}
							placeholder="4"
						/>
						{#if $errors.hoursPerWeek}
							<p class="text-sm text-destructive">{$errors.hoursPerWeek}</p>
						{/if}
					</div>
					<InputComp
						{errors}
						bind:value={$form.commitmentMonths}
						name="commitmentMonths"
						label="For how many months?"
						type="number"
						placeholder="Leave blank for open-ended"
						min="1"
						max="120"
						labelClass=""
					/>
					<InputComp
						{errors}
						bind:value={$form.availableFrom}
						name="availableFrom"
						label="Earliest you could start"
						type="date"
						labelClass=""
					/>
				</div>

				<div class="mt-5 flex flex-col gap-2">
					<Label for="availabilityNote">Anything we should know about your availability?</Label>
					<Textarea
						id="availabilityNote"
						rows={2}
						bind:value={$form.availabilityNote}
						placeholder="Not during exam weeks; away every August"
					/>
				</div>
			</Card.Root>

			<!-- ======================== Credentials ========================== -->
			<Card.Root id="section-credentials" class="scroll-mt-[145px] p-6 md:p-8">
				<div class="mb-2 flex items-center gap-3">
					<ShieldCheck class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">Are you a licensed professional?</h2>
				</div>
				<p class="mb-5 text-sm text-muted-foreground">
					Medical, mental health or allied health. We verify every licence with the issuing body
					before any placement involving direct care, so please give us the details exactly as they
					appear on it.
				</p>

				<label class="flex items-center gap-3">
					<Checkbox
						checked={$form.isProfessional}
						disabled={claimsCredentialSkill}
						onCheckedChange={(checked) => ($form.isProfessional = checked === true)}
					/>
					<span class="text-sm">
						Yes, I hold a professional licence
						{#if claimsCredentialSkill}
							<span class="text-muted-foreground"> (required by a skill you ticked above) </span>
						{/if}
					</span>
				</label>

				{#if $form.isProfessional}
					<div class="mt-6 flex flex-col gap-5">
						{#each $form.credentials as credential, index (index)}
							{@const profession = data.catalog.professions.find(
								(row) => row.id === credential.professionId
							)}
							<div class="rounded-lg border bg-muted/30 p-5">
								<div class="mb-4 flex items-center justify-between">
									<h3 class="text-sm font-medium">Licence {index + 1}</h3>
									{#if $form.credentials.length > 1}
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onclick={() => removeCredential(index)}
										>
											<Trash2 class="size-4" />
											Remove
										</Button>
									{/if}
								</div>

								<div class="grid gap-5 md:grid-cols-2">
									<div class="flex flex-col gap-2">
										<Label>Profession</Label>
										<Select.Root
											type="single"
											value={credential.professionId ? String(credential.professionId) : ''}
											onValueChange={(value) => setProfession(index, value)}
										>
											<Select.Trigger class="w-full">
												{profession?.name ?? 'Choose your profession'}
											</Select.Trigger>
											<Select.Content>
												{#each data.catalog.professions as row (row.id)}
													<Select.Item value={String(row.id)}>{row.name}</Select.Item>
												{/each}
											</Select.Content>
										</Select.Root>
									</div>

									<InputComp
										{errors}
										bind:value={credential.otherProfession}
										name="otherProfession-{index}"
										label="Not listed? Tell us what you are"
										type="text"
										placeholder="Your profession"
										labelClass=""
									/>

									<InputComp
										{errors}
										bind:value={credential.licenseNumber}
										name="licenseNumber-{index}"
										label="Licence number"
										type="text"
										labelClass=""
									/>

									<InputComp
										{errors}
										bind:value={credential.licensingBody}
										name="licensingBody-{index}"
										label="Issued by"
										type="text"
										placeholder={profession?.defaultLicensingBody ?? 'The licensing authority'}
										labelClass=""
									/>

									<InputComp
										{errors}
										bind:value={credential.specialization}
										name="specialization-{index}"
										label="Specialisation"
										type="text"
										placeholder="Paediatrics, trauma counselling…"
										labelClass=""
									/>

									<div class="flex flex-col gap-2">
										<Label for="yearsExperience-{index}">Years practising</Label>
										<Input
											id="yearsExperience-{index}"
											type="number"
											min="0"
											max="70"
											bind:value={credential.yearsExperience}
										/>
									</div>

									<InputComp
										{errors}
										bind:value={credential.issuedOn}
										name="issuedOn-{index}"
										label="Issued on"
										type="date"
										labelClass=""
									/>

									<InputComp
										{errors}
										bind:value={credential.expiresOn}
										name="expiresOn-{index}"
										label="Expires on"
										type="date"
										labelClass=""
									/>
								</div>
							</div>
						{/each}

						<div>
							<Button type="button" variant="outline" size="sm" onclick={addCredential}>
								<Plus class="size-4" />
								Add another licence
							</Button>
						</div>

						{#if $errors.credentials?._errors}
							<p class="text-sm text-destructive">{$errors.credentials._errors}</p>
						{/if}
					</div>
				{/if}
			</Card.Root>

			<!-- ========================= References ========================== -->
			<Card.Root id="section-references" class="scroll-mt-[145px] p-6 md:p-8">
				<div class="mb-2 flex items-center gap-3">
					<UserRound class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">
						Two references <span class="text-destructive">*</span>
					</h2>
				</div>
				<p class="mb-6 text-sm text-muted-foreground">
					People who know you well enough to speak to your character, and who are not family. We
					contact both before any placement.
				</p>

				<div class="flex flex-col gap-5">
					{#each $form.references as reference, index (index)}
						<div class="rounded-lg border bg-muted/30 p-5">
							<div class="mb-4 flex items-center justify-between">
								<h3 class="text-sm font-medium">Reference {index + 1}</h3>
								{#if $form.references.length > 2}
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onclick={() => removeReference(index)}
									>
										<Trash2 class="size-4" />
										Remove
									</Button>
								{/if}
							</div>

							<div class="grid gap-5 md:grid-cols-2">
								<div class="flex flex-col gap-2">
									<Label for="referenceName-{index}"
										>Their full name <span class="text-destructive">*</span></Label
									>
									<Input id="referenceName-{index}" bind:value={reference.fullName} />
									{#if $errors.references?.[index]?.fullName}
										<p class="text-sm text-destructive">{$errors.references[index].fullName}</p>
									{/if}
								</div>
								<div class="flex flex-col gap-2">
									<Label for="referenceRelationship-{index}"
										>How do they know you? <span class="text-destructive">*</span></Label
									>
									<Input
										id="referenceRelationship-{index}"
										bind:value={reference.relationship}
										placeholder="Former manager, lecturer, pastor"
									/>
									{#if $errors.references?.[index]?.relationship}
										<p class="text-sm text-destructive">{$errors.references[index].relationship}</p>
									{/if}
								</div>
								<InputComp
									{errors}
									bind:value={reference.email}
									name="referenceEmail-{index}"
									label="Their email"
									type="email"
									labelClass=""
								/>
								<InputComp
									{errors}
									bind:value={reference.phone}
									name="referencePhone-{index}"
									label="Their phone number"
									type="tel"
									labelClass=""
								/>
								<div class="flex flex-col gap-2 md:col-span-2">
									<Label for="referenceOrganization-{index}">Where they work, if relevant</Label>
									<Input id="referenceOrganization-{index}" bind:value={reference.organization} />
								</div>
							</div>
						</div>
					{/each}
				</div>

				<div class="mt-5">
					<Button type="button" variant="outline" size="sm" onclick={addReference}>
						<Plus class="size-4" />
						Add another reference
					</Button>
				</div>
			</Card.Root>

			<!-- ======================== Why, and consent ====================== -->
			<Card.Root id="section-consent" class="scroll-mt-[145px] p-6 md:p-8">
				<div class="mb-6 flex items-center gap-3">
					<ShieldCheck class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">Last few things</h2>
				</div>

				<div class="flex flex-col gap-5">
					<div class="flex flex-col gap-2">
						<Label for="motivation"
							>Why do you want to volunteer with us? <span class="text-destructive">*</span></Label
						>
						<Textarea id="motivation" rows={4} bind:value={$form.motivation} />
						{#if $errors.motivation}
							<p class="text-sm text-destructive">{$errors.motivation}</p>
						{/if}
					</div>

					<InputComp
						{errors}
						bind:value={$form.heardAbout}
						name="heardAbout"
						label="How did you hear about the Foundation?"
						type="text"
						labelClass=""
					/>

					<div class="flex flex-col gap-3">
						<Label>Have you ever been convicted of a criminal offence?</Label>
						<p class="text-sm text-muted-foreground">
							A conviction does not automatically rule you out. Not telling us does.
						</p>
						<div class="flex gap-2">
							<Button
								type="button"
								size="sm"
								variant={$form.hasPriorConviction === false ? 'default' : 'outline'}
								onclick={() => ($form.hasPriorConviction = false)}
							>
								No
							</Button>
							<Button
								type="button"
								size="sm"
								variant={$form.hasPriorConviction === true ? 'default' : 'outline'}
								onclick={() => ($form.hasPriorConviction = true)}
							>
								Yes
							</Button>
						</div>
						{#if $form.hasPriorConviction === true}
							<Textarea
								rows={3}
								bind:value={$form.priorConvictionDetail}
								placeholder="Briefly, what happened and when."
							/>
							{#if $errors.priorConvictionDetail}
								<p class="text-sm text-destructive">{$errors.priorConvictionDetail}</p>
							{/if}
						{/if}
					</div>

					<CheckboxField
						{errors}
						bind:checked={$form.consentBackgroundCheck}
						name="consentBackgroundCheck"
					>
						<span class="text-destructive">*</span> I agree to the Foundation contacting my references
						and carrying out the background and, where relevant, licence checks described above.
					</CheckboxField>

					<CheckboxField {errors} bind:checked={$form.agreeCodeOfConduct} name="agreeCodeOfConduct">
						<span class="text-destructive">*</span> I have read and accept the volunteer
						<a href="/terms" class="underline underline-offset-2">code of conduct</a>
						and the
						<a href="/privacy" class="underline underline-offset-2">privacy policy</a>.
					</CheckboxField>

					<CheckboxField {errors} bind:checked={$form.declareAccurate} name="declareAccurate">
						<span class="text-destructive">*</span> I confirm that everything I have entered above is
						accurate and complete.
					</CheckboxField>

					<CheckboxField
						{errors}
						bind:checked={$form.acknowledgeNoGuarantee}
						name="acknowledgeNoGuarantee"
					>
						<span class="text-destructive">*</span> I understand that sending this application does not
						guarantee a placement. Every application goes through safeguarding checks, and we can only
						place volunteers where there is a role to fill.
					</CheckboxField>
				</div>

				<div class="my-2" aria-hidden="true"></div>

				<div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
					<p class="text-sm text-muted-foreground">
						We read every application. Expect to hear from us within two weeks.
					</p>
					<Button type="submit" size="lg" disabled={$delayed}>
						{#if $delayed}
							<LoadingBtn name="Sending" />
						{:else}
							Send my application
						{/if}
					</Button>
				</div>
			</Card.Root>
		</form>
	{/if}
</div>
