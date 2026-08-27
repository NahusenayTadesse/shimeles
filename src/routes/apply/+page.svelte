<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import Seo from '$lib/components/Seo.svelte';
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
	import Errors from '$lib/formComponents/Errors.svelte';
	import { focusFirstError } from '$lib/formComponents/form-errors';
	import { formDraft } from '$lib/formComponents/form-draft.svelte';
	import DraftBanner from '$lib/formComponents/DraftBanner.svelte';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import InputComp from '$lib/formComponents/InputComp.svelte';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import CheckboxField from '$lib/formComponents/CheckboxField.svelte';
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
	import { PERSON_GENDER_OPTIONS, genderLabel as genderLabelFor } from '$lib/gender';

	let { data } = $props();

	const s = (key: string, fallback: string) => data.strings?.[key] ?? fallback;

	/** Matches the server's own ceiling in `$lib/server/upload.ts`, kept here
	 *  as a plain constant since client code cannot import server modules. */
	const MAX_DOCUMENTS = 6;
	const MAX_DOCUMENT_MB = 10;

	const SECTIONS = [
		{ id: 'section-who', label: 'Who' },
		{ id: 'section-about', label: 'About' },
		{ id: 'section-needs', label: 'Needs' },
		{ id: 'section-documents', label: 'Documents' },
		{ id: 'section-reach', label: 'Reaching you' },
		{ id: 'section-consent', label: 'Consent' }
	];
	let activeSection = $state(SECTIONS[0].id);

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
	 * `dataType: 'json'` because the chosen needs are an array of objects, each
	 * with its own detail, amount and urgency. Documents ride alongside as a
	 * plain file input read off the body on the server.
	 */
	const { form, errors, enhance, delayed, message, allErrors, tainted } = superForm(data.form, {
		dataType: 'json',
		resetForm: false,
		taintedMessage: 'You have not finished this form. Leave anyway?'
	});

	let confirmation = $state<string | null>(null);
	let documentNames = $state<string[]>([]);
	let documentError = $state<string | null>(null);

	/*
	 * A draft of this form, kept on this device only.
	 *
	 * Saved on a debounce as the person types and offered back behind a banner
	 * — never applied on its own. Cleared the moment the form is submitted, so
	 * a finished application does not sit in the browser afterwards.
	 */
	const draft = formDraft('apply');

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
			confirmation = $message.reference ?? '';
			// The application is stored, so the answers still sitting in `$form`
			// are no longer unsaved work — without this the leave-guard would
			// challenge someone for navigating away from a finished submission.
			$tainted = undefined;
			// The answers are on the server now; nothing should keep a copy of a
			// household's circumstances in this browser.
			draft.discard();
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
		immediate: 'Right now, it is an emergency'
	};

	const urgencyItems = URGENCY.map((level) => ({ value: level, name: URGENCY_LABELS[level] }));

	const regionItems = $derived(
		data.catalog.regions.map((region) => ({ value: String(region.id), name: region.name }))
	);

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

	const genderLabel = $derived(genderLabelFor($form.subjectGender));

	const chosenLanguage = $derived(
		data.catalog.languages.find((language) => language.id === $form.writtenLanguageId) ?? null
	);

	/** Whoever the form is about, for the section heading. */
	const subjectWord = $derived($form.applyingFor === 'self' ? 'you' : 'them');

	const onDocuments = (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		const files = [...(input.files ?? [])];
		documentNames = files.map((file) => file.name);

		if (files.length > MAX_DOCUMENTS) {
			documentError = `You have chosen ${files.length} files. Please keep it to ${MAX_DOCUMENTS} or fewer.`;
			return;
		}
		const tooBig = files.filter((file) => file.size > MAX_DOCUMENT_MB * 1024 * 1024);
		if (tooBig.length) {
			documentError = `${tooBig.map((file) => file.name).join(', ')}: over ${MAX_DOCUMENT_MB} MB. Please choose a smaller file.`;
			return;
		}
		documentError = null;
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

<Seo
	title={data.page?.title ?? 'Apply for support'}
	description={data.page?.metaDescription}
	image={data.page?.shareImage}
	imageAlt={data.page?.title ?? 'Apply for support'}
	breadcrumbs={[
		{ name: 'Home', path: '/' },
		{ name: data.page?.title ?? 'Apply for support', path: '/apply' }
	]}
/>

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
				Someone will read it and get in touch. If anything changes in the meantime, or if things get
				worse, please call us rather than waiting.
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
			<!-- What happens next.

			     There is no route where an applicant can look their reference up —
			     deliberately, since a reference number alone is a weak credential
			     and a status portal built on one would let anyone who guesses a
			     number read case detail. But "we will be in touch" with no way to
			     check is hard on someone waiting, so the least this page can do is
			     say what the wait looks like and who to ask. -->
			<div class="mt-2 w-full max-w-prose rounded-lg border bg-muted/40 p-5 text-left">
				<h3 class="font-heading text-sm font-semibold">What happens next</h3>
				<ol class="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
					<li>A caseworker reads your application, usually within a few working days.</li>
					<li>
						We may call you to ask about anything that was not clear, so please keep the number you
						gave us switched on.
					</li>
					<li>
						We will tell you either way. If we cannot help with something, we will say what else is
						available.
					</li>
				</ol>
				{#if data.settings?.['contact.phone_1']}
					<p class="mt-4 text-sm">
						To ask about it before then, call
						<a class="font-medium underline" href="tel:{data.settings['contact.phone_1']}">
							<Phone class="mr-1 inline size-4" />{data.settings['contact.phone_1']}
						</a>
						and quote your reference.
					</p>
				{/if}
			</div>
		</Card.Root>
	{:else}
		{#if contentBlocks.length}
			<div class="mb-10 flex flex-col gap-8">
				<BlockRenderer
					blocks={contentBlocks}
					pillars={data.blocks?.pillars ?? []}
					initiatives={data.blocks?.initiatives ?? []}
					metrics={data.blocks?.metrics ?? {}}
					moneyTotals={data.blocks?.moneyTotals ?? {}}
					payments={data.blocks?.payments ?? []}
					initiativeNotice={data.settings?.['initiatives.disclaimer'] ?? ''}
				/>
			</div>
		{/if}

		<!-- Said before anything is asked, because someone who cannot write
		     English should not have to read half a form to find that out. -->
		<!-- The asterisk means two things unless we say so: starred questions are
		     not HTML-`required` (§3.3 keeps the form low-barrier), so the browser
		     will not stop the submit but the server will refuse it. Saying which
		     is which up front costs a sentence. -->
		<p class="mb-6 text-sm text-muted-foreground">
			We can work with gaps, so answer what you can. The questions marked
			<span class="text-destructive">*</span> are the few we do need before anyone can look at your application.
		</p>

		<Card.Root class="mb-6 border-primary/40 bg-primary/5 p-5">
			<div class="flex items-start gap-3">
				<LanguagesIcon class="mt-0.5 size-5 shrink-0 text-primary" />
				<div>
					<p class="font-medium">Write in whatever language you are comfortable in</p>
					<p class="mt-1 text-sm text-muted-foreground">
						Amharic, Afaan Oromo, Tigrinya, Somali, English: whichever you think in. Nobody is
						assessed on their writing, and we will find someone who reads it. Just tell us below
						which language you have used.
					</p>
				</div>
			</div>
		</Card.Root>

		<!-- A section jump-nav so a long, scrolling form still reads as "six
		     short steps" rather than one wall of fields. -->
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
			enctype="multipart/form-data"
			use:enhance
			use:observeSections
			class="flex flex-col gap-6"
		>
			{#if draft.available}
				<DraftBanner
					savedAt={draft.savedAt}
					onrestore={restoreDraft}
					ondiscard={() => draft.discard()}
				/>
			{/if}

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
			<Card.Root id="section-who" class="scroll-mt-[145px] p-6 md:p-8">
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

				<div class="my-2" aria-hidden="true"></div>

				<div class="grid gap-5 md:grid-cols-2">
					<InputComp
						{errors}
						bind:value={$form.applicantName}
						name="applicantName"
						label="Your name"
						type="text"
						autocomplete="name"
						showRequired
						labelClass=""
					/>

					{#if $form.applyingFor === 'other'}
						<div class="flex flex-col gap-2">
							<Label for="relationship"
								>How do you know them? <span class="text-destructive">*</span></Label
							>
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
					A phone number or an email, one is enough. We need some way to come back to you.
				</p>
			</Card.Root>

			<!-- ==================== About the person ==================== -->
			<Card.Root id="section-about" class="scroll-mt-[145px] p-6 md:p-8">
				<div class="mb-2 flex items-center gap-3">
					<Home class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">
						{$form.applyingFor === 'self' ? 'About you' : 'About the person you are applying for'}
					</h2>
				</div>
				<p class="mb-5 text-sm text-muted-foreground">
					Everything here is optional. Fill in what you know, because an incomplete application is
					far better than none, and we can ask the rest when we speak.
				</p>

				<div class="grid gap-5 md:grid-cols-2">
					{#if $form.applyingFor === 'other'}
						<InputComp
							{errors}
							bind:value={$form.subjectName}
							name="subjectName"
							label="Their name"
							type="text"
							showRequired
							labelClass=""
						/>

						<InputComp
							{errors}
							bind:value={$form.subjectPhone}
							name="subjectPhone"
							label="Their phone number"
							type="tel"
							labelClass=""
						/>
					{/if}

					<InputComp
						{errors}
						bind:value={$form.subjectDateOfBirth}
						name="subjectDateOfBirth"
						label="Date of birth"
						type="date"
						year
						labelClass=""
					/>

					<InputComp
						{errors}
						bind:value={$form.subjectApproximateAge}
						name="subjectApproximateAge"
						label="Or roughly how old?"
						type="number"
						placeholder="If the exact date is not known"
						min="0"
						max="120"
						labelClass=""
					/>

					<div class="flex flex-col gap-2">
						<Label>Gender</Label>
						<SelectComp
							name="subjectGender"
							value={$form.subjectGender}
							items={PERSON_GENDER_OPTIONS}
							searchable={false}
							triggerClass="normal-case"
							placeholder={genderLabel}
							onValueChange={(value) => ($form.subjectGender = value as typeof $form.subjectGender)}
						/>
					</div>

					<InputComp
						{errors}
						bind:value={$form.city}
						name="city"
						label="Where do {subjectWord} live?"
						type="text"
						placeholder="Sub-city, town or kebele"
						labelClass=""
					/>

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
							<SelectComp
								name="regionId"
								value={$form.regionId ? String($form.regionId) : ''}
								items={regionItems}
								triggerClass="normal-case"
								placeholder="Choose a region"
								onValueChange={(value) => ($form.regionId = value ? Number(value) : null)}
							/>
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

					<InputComp
						{errors}
						bind:value={$form.monthlyIncome}
						name="monthlyIncome"
						label="Household income each month (birr)"
						type="number"
						placeholder="A rough figure is fine"
						min="0"
						labelClass=""
					/>

					<InputComp
						{errors}
						bind:value={$form.incomeSource}
						name="incomeSource"
						label="Where does that income come from?"
						type="text"
						placeholder="Daily work, a pension, family sending money…"
						labelClass=""
					/>
				</div>

				<div class="my-2" aria-hidden="true"></div>

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
							placeholder="Another charity, a government programme, family, so we add to it rather than repeat it"
						/>
					</div>
				</div>
			</Card.Root>

			<!-- ==================== What is needed ==================== -->
			<Card.Root id="section-needs" class="scroll-mt-[145px] p-6 md:p-8">
				<div class="mb-2 flex items-center gap-3">
					<LifeBuoy class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">What do you need?</h2>
				</div>
				<p class="mb-5 text-sm text-muted-foreground">
					Tick anything that applies. If none of it fits, leave them all and just write to us below
					We read every application either way.
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
							Not knowing is fine, we work it out from what you tell us.
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
													<SelectComp
														name="urgency"
														value={claim.urgency}
														items={urgencyItems}
														searchable={false}
														triggerClass="h-8 flex-1 text-xs normal-case"
														onValueChange={(value) => updateNeed(need.id, { urgency: value })}
													/>
												</div>
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
					<Label for="story"
						>Tell us what is happening <span class="text-destructive">*</span></Label
					>
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
			<Card.Root id="section-documents" class="scroll-mt-[145px] p-6 md:p-8">
				<div class="mb-2 flex items-center gap-3">
					<Paperclip class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">Anything that supports this?</h2>
				</div>
				<p class="mb-4 text-sm text-muted-foreground">
					A medical letter, a school report, a prescription, a photograph of a document. Optional,
					send what you have, and nothing if you have nothing. Up to {MAX_DOCUMENTS} files, {MAX_DOCUMENT_MB}
					MB each.
				</p>

				{#if evidenceHints.length}
					<div class="mb-4 rounded-lg border border-dashed p-3">
						<p class="mb-1 text-xs font-medium">Helpful for what you ticked:</p>
						<ul class="ml-4 list-disc text-xs text-muted-foreground">
							{#each evidenceHints as hint (hint.name)}
								<li>{hint.name}: {hint.hint}</li>
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

				{#if documentError}
					<p class="mt-2 text-sm text-destructive">{documentError}</p>
				{/if}

				{#if documentNames.length}
					<div class="mt-3 flex flex-wrap gap-2">
						{#each documentNames as name (name)}
							<Badge variant="secondary">{name}</Badge>
						{/each}
					</div>
				{/if}
			</Card.Root>

			<!-- ==================== Reaching you ==================== -->
			<Card.Root id="section-reach" class="scroll-mt-[145px] p-6 md:p-8">
				<div class="mb-5 flex items-center gap-3">
					<Phone class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">How should we reach you?</h2>
				</div>

				<div class="grid gap-5 md:grid-cols-2">
					<InputComp
						{errors}
						bind:value={$form.bestTimeToContact}
						name="bestTimeToContact"
						label="Best time to call"
						type="text"
						placeholder="Mornings, after 6pm, weekends…"
						labelClass=""
					/>

					<InputComp
						{errors}
						bind:value={$form.alternateContactName}
						name="alternateContactName"
						label="Someone else we can call"
						type="text"
						placeholder="If we cannot reach you"
						labelClass=""
					/>

					<InputComp
						{errors}
						bind:value={$form.alternateContactPhone}
						name="alternateContactPhone"
						label="Their number"
						type="tel"
						labelClass=""
					/>
				</div>

				<div class="my-2" aria-hidden="true"></div>

				<!-- Not politeness. Someone applying about a family situation or a
				     mental health crisis may not be safe to ring at home, and a
				     caseworker has to know that before they dial. -->
				<CheckboxField
					bind:checked={$form.safeToContact}
					invert
					label="Please be careful how you contact me. It may not be safe or private to call at any time."
				/>

				{#if !$form.safeToContact}
					<div class="mt-3 flex flex-col gap-2">
						<Label for="contactNotes">What should we know before we get in touch?</Label>
						<Textarea id="contactNotes" rows={2} bind:value={$form.contactNotes} />
					</div>
				{/if}
			</Card.Root>

			<!-- ==================== Consent ==================== -->
			<Card.Root id="section-consent" class="scroll-mt-[145px] p-6 md:p-8">
				<div class="mb-5 flex items-center gap-3">
					<ShieldCheck class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">Before you send it</h2>
				</div>

				<div class="flex flex-col gap-4">
					<CheckboxField {errors} bind:checked={$form.consentToStore} name="consentToStore">
						<span class="text-destructive">*</span> I agree that the Foundation may keep this
						application and the details in it in order to assess it. See the
						<a href="/privacy" class="underline underline-offset-2">privacy policy</a>.
					</CheckboxField>

					<CheckboxField
						{errors}
						bind:checked={$form.consentToVerify}
						name="consentToVerify"
						label="I agree that the Foundation may check what I have said, with a hospital, a school, or by visiting. Optional; it usually makes the assessment faster."
					/>

					<CheckboxField {errors} bind:checked={$form.declareAccurate} name="declareAccurate">
						<span class="text-destructive">*</span> I confirm that what I have written here is accurate
						and complete, as far as I know.
					</CheckboxField>

					<!-- Said plainly and on the form itself, because the waiting list
					     is the ordinary outcome rather than the exception. -->
					<CheckboxField
						{errors}
						bind:checked={$form.acknowledgeNoGuarantee}
						name="acknowledgeNoGuarantee"
					>
						<span class="text-destructive">*</span> I understand that sending this application does not
						guarantee help, and does not guarantee it straight away. Applications go onto a waiting list
						and are assessed at each intake round; we get in touch when there is a programme you match.
					</CheckboxField>
				</div>

				<div class="my-2" aria-hidden="true"></div>

				<div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
					<p class="text-sm text-muted-foreground">
						{#if data.settings?.['contact.phone_1']}
							If this is an emergency, call {data.settings['contact.phone_1']} rather than waiting for
							a reply.
						{:else}
							If this is an emergency, please call us rather than waiting for a reply.
						{/if}
					</p>
					<Button type="submit" size="lg" disabled={$delayed || Boolean(documentError)}>
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
