<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import InputComp from '$lib/formComponents/InputComp.svelte';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import CheckboxField from '$lib/formComponents/CheckboxField.svelte';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import { CalendarClock, Plus, ShieldCheck, Sparkles, Trash2, UserRound } from '@lucide/svelte';
	import { PROFICIENCY } from '../../routes/volunteer/schema';
	import { genderLabel } from '$lib/gender';

	/**
	 * Every question the intake does not ask, rendered from whatever the schema
	 * in front of it happens to carry.
	 *
	 * One component, three callers: the volunteer's own completion link, where
	 * `visible` comes from the coordinator's choices on the invite; the staff
	 * edit screen, where everything is shown and nothing is required; and, in
	 * future, whatever else needs these fields. They were three copies of the
	 * same markup in an earlier draft and had already drifted by the time the
	 * second one was written.
	 *
	 * `visible` is the set of *schema keys* the form carries — not the part keys
	 * a coordinator ticks. `visibleFieldKeys()` translates between the two, and
	 * doing that translation once, on the server, is what keeps this component
	 * from having to know the catalogue exists. A field not in the set was never
	 * asked, is not in the schema, and must not be rendered: binding it would
	 * post a key the validator would strip and the writer would ignore.
	 */
	let {
		form,
		errors,
		catalog,
		visible,
		/**
		 * `admin` drops the asterisks and the second-person voice. The questions
		 * are the same; who is answering them is not, and "your emergency
		 * contact" is wrong on a screen where a coordinator is typing up a phone
		 * call about somebody else.
		 */
		mode = 'volunteer'
	}: {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		form: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		errors: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		catalog: any;
		visible: string[];
		mode?: 'volunteer' | 'admin';
	} = $props();

	const shown = $derived(new Set(visible));
	const has = (key: string) => shown.has(key);
	const staff = $derived(mode === 'admin');

	/** An asterisk means "the server will refuse this". On the staff screen nothing is refused. */
	const req = $derived(!staff);

	/* --- Skills ------------------------------------------------------------ */

	const skillClaim = (skillId: number) =>
		$form.skills?.find((claim: { skillId: number }) => claim.skillId === skillId);

	const toggleSkill = (skillId: number) => {
		$form.skills = skillClaim(skillId)
			? $form.skills.filter((claim: { skillId: number }) => claim.skillId !== skillId)
			: [...($form.skills ?? []), { skillId, proficiency: 'intermediate' as const }];
	};

	const setProficiency = (skillId: number, proficiency: string) => {
		$form.skills = $form.skills.map((claim: { skillId: number }) =>
			claim.skillId === skillId ? { ...claim, proficiency } : claim
		);
	};

	const PROFICIENCY_LABELS: Record<string, string> = {
		basic: 'Some experience',
		intermediate: 'Confident',
		advanced: 'Very experienced',
		professional: 'This is my profession'
	};

	const proficiencyItems = PROFICIENCY.map((level) => ({
		value: level,
		name: PROFICIENCY_LABELS[level]
	}));

	const genderItems = [
		{ value: 'female', name: 'Female' },
		{ value: 'male', name: 'Male' },
		{ value: 'other', name: 'Other' },
		{ value: 'prefer_not_to_say', name: 'Prefer not to say' }
	];

	const regionItems = $derived(
		(catalog.regions ?? []).map((region: { id: number; name: string }) => ({
			value: String(region.id),
			name: region.name
		}))
	);

	const professionItems = $derived(
		(catalog.professions ?? []).map((row: { id: number; name: string }) => ({
			value: String(row.id),
			name: row.name
		}))
	);

	/**
	 * Skills the catalogue marks as needing a credential. Ticking one is what
	 * opens the credentials section — a volunteer who says they can do clinical
	 * counselling is telling us they are a professional, whether or not they
	 * then tick the box that says so.
	 *
	 * Only meaningful when both parts are on the form. A coordinator who hid the
	 * credentials section has decided this person is not applying as a
	 * professional, and a ticked skill must not overrule them by turning on a
	 * section that is not there.
	 */
	const credentialSkills = $derived(
		(catalog.skills ?? []).flatMap(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(group: any) => group.skills.filter((skill: any) => skill.requiresCredential)
		)
	);

	const claimsCredentialSkill = $derived(
		has('credentials') &&
			has('skills') &&
			credentialSkills.some((skill: { id: number }) => Boolean(skillClaim(skill.id)))
	);

	$effect(() => {
		// One-way: ticking a professional skill turns the section on. Turning it
		// off again is the volunteer's own choice to make, and unticking the
		// skill is how they do it.
		if (claimsCredentialSkill && !$form.isProfessional) $form.isProfessional = true;
	});

	/* --- Availability ------------------------------------------------------ */

	const OTHER_SKILLS_PLACEHOLDER = 'Sign language\nMinibus driving';

	const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	/** Slots grouped by weekday, with dayless slots ("on call") kept last. */
	const slotGroups = $derived.by(() => {
		const slots = catalog.timeSlots ?? [];
		const days = [
			...new Set(slots.map((slot: { dayOfWeek: number | null }) => slot.dayOfWeek))
		].sort((a, b) => ((a as number) ?? 99) - ((b as number) ?? 99));
		return days.map((day) => ({
			label: day === null ? 'Any time' : DAY_NAMES[day as number],
			slots: slots.filter((slot: { dayOfWeek: number | null }) => slot.dayOfWeek === day)
		}));
	});

	const toggleSlot = (id: number) => {
		$form.timeSlotIds = $form.timeSlotIds.includes(id)
			? $form.timeSlotIds.filter((slotId: number) => slotId !== id)
			: [...($form.timeSlotIds ?? []), id];
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

	const addCredential = () =>
		($form.credentials = [...($form.credentials ?? []), blankCredential()]);

	const removeCredential = (index: number) => {
		$form.credentials = $form.credentials.filter(
			(_: unknown, position: number) => position !== index
		);
	};

	$effect(() => {
		// The section is never shown empty: saying "yes, I am a professional" and
		// being given nothing to fill in is a dead end.
		if (has('credentials') && $form.isProfessional && !$form.credentials?.length) addCredential();
	});

	/** Pre-fills the licensing body from the profession that was picked. */
	const setProfession = (index: number, value: string) => {
		const professionId = value ? Number(value) : null;
		const profession = (catalog.professions ?? []).find(
			(row: { id: number }) => row.id === professionId
		);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		$form.credentials = $form.credentials.map((credential: any, position: number) =>
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

	const blankReference = () => ({
		fullName: '',
		relationship: '',
		organization: '',
		email: '',
		phone: ''
	});

	const addReference = () => ($form.references = [...($form.references ?? []), blankReference()]);

	const removeReference = (index: number) => {
		$form.references = $form.references.filter(
			(_: unknown, position: number) => position !== index
		);
	};

	/** Two on the volunteer's form because two is the requirement; none on staff's. */
	const minimumReferences = $derived(staff ? 0 : 2);
</script>

{#if has('city') || has('country') || has('dateOfBirth') || has('gender') || has('occupation') || has('regionId')}
	<Card.Root class="p-6 md:p-8">
		<div class="mb-6 flex items-center gap-3">
			<UserRound class="size-5 text-primary" />
			<h2 class="font-heading text-xl font-semibold">
				{staff ? 'About them' : 'About you'}
			</h2>
		</div>

		<div class="grid gap-5 md:grid-cols-2">
			{#if has('city')}
				<InputComp
					{errors}
					bind:value={$form.city}
					name="city"
					label={staff ? 'Where they live' : 'Where do you live?'}
					type="text"
					placeholder="Sub-city, or the nearest town"
					labelClass=""
				/>
			{/if}

			{#if has('regionId') && regionItems.length > 1}
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

			{#if has('country')}
				<!-- `city` and the region are Ethiopian geography, so somebody
				     writing in from abroad has nowhere else to say where they are. -->
				<InputComp
					{errors}
					bind:value={$form.country}
					name="country"
					label="Country"
					type="text"
					placeholder="Ethiopia, unless applying from abroad"
					autocomplete="country-name"
					labelClass=""
				/>
			{/if}

			{#if has('dateOfBirth')}
				<InputComp
					{errors}
					bind:value={$form.dateOfBirth}
					name="dateOfBirth"
					label="Date of birth"
					type="date"
					labelClass=""
				/>
			{/if}

			{#if has('gender')}
				<div class="flex flex-col gap-2">
					<Label>Gender</Label>
					<SelectComp
						name="gender"
						value={$form.gender ?? ''}
						items={genderItems}
						searchable={false}
						triggerClass="normal-case"
						placeholder={genderLabel($form.gender)}
						onValueChange={(value) => ($form.gender = value || null)}
					/>
				</div>
			{/if}

			{#if has('occupation')}
				<InputComp
					{errors}
					bind:value={$form.occupation}
					name="occupation"
					label={staff ? 'Occupation' : 'What do you do?'}
					type="text"
					placeholder="Work or studies"
					labelClass=""
				/>

				<InputComp
					{errors}
					bind:value={$form.organisationName}
					name="organisationName"
					label={staff ? 'Organisation, if any' : 'Organisation, if you are applying through one'}
					type="text"
					placeholder="An employer, university or association"
					labelClass=""
				/>
			{/if}
		</div>
	</Card.Root>
{/if}

<!-- Always asked. There is no part key that can hide this. -->
<Card.Root class="p-6 md:p-8">
	<div class="mb-4">
		<h2 class="font-heading text-xl font-semibold">Emergency contact</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			{staff
				? 'The one person the Foundation calls if something happens on a placement.'
				: 'One person we can call if something happens while you are with us.'}
		</p>
	</div>

	<div class="grid gap-5 md:grid-cols-3">
		<div class="flex flex-col gap-2">
			<Label for="emergencyContactName">
				Their name {#if req}<span class="text-destructive">*</span>{/if}
			</Label>
			<Input id="emergencyContactName" bind:value={$form.emergencyContactName} />
			{#if $errors.emergencyContactName}
				<p class="text-sm text-destructive">{$errors.emergencyContactName}</p>
			{/if}
		</div>
		<div class="flex flex-col gap-2">
			<Label for="emergencyContactPhone">
				Their phone number {#if req}<span class="text-destructive">*</span>{/if}
			</Label>
			<Input id="emergencyContactPhone" type="tel" bind:value={$form.emergencyContactPhone} />
			{#if $errors.emergencyContactPhone}
				<p class="text-sm text-destructive">{$errors.emergencyContactPhone}</p>
			{/if}
		</div>
		<InputComp
			{errors}
			bind:value={$form.emergencyContactRelationship}
			name="emergencyContactRelationship"
			label={staff ? 'Relationship' : 'Relationship to you'}
			type="text"
			placeholder="Spouse, parent, friend"
			labelClass=""
		/>
	</div>
</Card.Root>

{#if (has('skills') && catalog.skills?.length) || has('otherSkills')}
	<Card.Root class="p-6 md:p-8">
		<div class="mb-2 flex items-center gap-3">
			<Sparkles class="size-5 text-primary" />
			<h2 class="font-heading text-xl font-semibold">
				{staff ? 'Skills' : 'What can you bring?'}
			</h2>
		</div>
		<p class="mb-6 text-sm text-muted-foreground">
			{staff
				? 'Nothing here is a commitment; it is what they can be asked to do.'
				: 'Tick anything you could genuinely be asked to do. Nothing here is a commitment.'}
		</p>

		{#if has('skills')}
			<div class="flex flex-col gap-7">
				{#each catalog.skills as group (group.id ?? group.name)}
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
												<span class="mt-0.5 block text-xs text-muted-foreground">{skill.hint}</span>
											{/if}
										</span>
									</label>

									{#if claim}
										<div class="mt-3 pl-7">
											<SelectComp
												name="proficiency"
												value={claim.proficiency}
												items={proficiencyItems}
												searchable={false}
												triggerClass="h-8 w-full text-xs normal-case"
												onValueChange={(value) => setProficiency(skill.id, value)}
											/>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if has('otherSkills')}
			<div class="mt-6 flex flex-col gap-2">
				<Label for="otherSkills">Anything else? One per line.</Label>
				<Textarea
					id="otherSkills"
					rows={3}
					bind:value={$form.otherSkills}
					placeholder={OTHER_SKILLS_PLACEHOLDER}
				/>
			</div>
		{/if}
	</Card.Root>
{/if}

{#if has('timeSlotIds') || has('hoursPerWeek') || has('availableFrom') || has('availabilityNote') || has('heardAbout')}
	<Card.Root class="p-6 md:p-8">
		<div class="mb-2 flex items-center gap-3">
			<CalendarClock class="size-5 text-primary" />
			<h2 class="font-heading text-xl font-semibold">
				{staff ? 'Availability' : 'When are you usually free?'}
				{#if req && has('timeSlotIds')}<span class="text-destructive">*</span>{/if}
			</h2>
		</div>
		<p class="mb-6 text-sm text-muted-foreground">
			Rough is fine. It is used to match work to when someone is actually around.
		</p>

		{#if has('timeSlotIds') && catalog.timeSlots?.length}
			<div class="flex flex-col gap-5">
				{#each slotGroups as group (group.label)}
					<div>
						<h3 class="mb-2 text-sm font-medium text-muted-foreground">{group.label}</h3>
						<div class="flex flex-wrap gap-2">
							{#each group.slots as slot (slot.id)}
								{@const chosen = ($form.timeSlotIds ?? []).includes(slot.id)}
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

		{#if has('hoursPerWeek') || has('availableFrom')}
			<div class="mt-7 grid gap-5 md:grid-cols-3">
				{#if has('hoursPerWeek')}
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
				{/if}

				{#if has('availableFrom')}
					<InputComp
						{errors}
						bind:value={$form.availableFrom}
						name="availableFrom"
						label={staff ? 'Earliest start' : 'Earliest you could start'}
						type="date"
						labelClass=""
					/>
				{/if}
			</div>
		{/if}

		{#if has('availabilityNote')}
			<div class="mt-5 flex flex-col gap-2">
				<Label for="availabilityNote">
					{staff ? 'Notes on availability' : 'Anything we should know about your availability?'}
				</Label>
				<Textarea
					id="availabilityNote"
					rows={2}
					bind:value={$form.availabilityNote}
					placeholder="Not during exam weeks; away every August"
				/>
			</div>
		{/if}

		{#if has('heardAbout')}
			<div class="mt-5">
				<InputComp
					{errors}
					bind:value={$form.heardAbout}
					name="heardAbout"
					label={staff ? 'How they heard about us' : 'How did you hear about the Foundation?'}
					type="text"
					labelClass=""
				/>
			</div>
		{/if}
	</Card.Root>
{/if}

{#if has('credentials')}
	<Card.Root class="p-6 md:p-8">
		<div class="mb-2 flex items-center gap-3">
			<ShieldCheck class="size-5 text-primary" />
			<h2 class="font-heading text-xl font-semibold">
				{staff ? 'Professional credentials' : 'Are you a licensed professional?'}
			</h2>
		</div>
		<p class="mb-5 text-sm text-muted-foreground">
			Medical, mental health or allied health. Every licence is verified with the issuing body
			before any placement involving direct care, so the details must match it exactly.
		</p>

		<label class="flex items-center gap-3">
			<Checkbox
				checked={$form.isProfessional}
				disabled={claimsCredentialSkill}
				onCheckedChange={(checked) => ($form.isProfessional = checked === true)}
			/>
			<span class="text-sm">
				{staff ? 'They hold a professional licence' : 'Yes, I hold a professional licence'}
				{#if claimsCredentialSkill}
					<span class="text-muted-foreground"> (required by a skill ticked above) </span>
				{/if}
			</span>
		</label>

		{#if $form.isProfessional}
			<div class="mt-6 flex flex-col gap-5">
				{#each $form.credentials ?? [] as credential, index (index)}
					{@const profession = (catalog.professions ?? []).find(
						(row: { id: number }) => row.id === credential.professionId
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
								<SelectComp
									name="professionId"
									value={credential.professionId ? String(credential.professionId) : ''}
									items={professionItems}
									triggerClass="normal-case"
									placeholder="Choose a profession"
									onValueChange={(value) => setProfession(index, value)}
								/>
							</div>

							<InputComp
								{errors}
								bind:value={credential.otherProfession}
								name="otherProfession-{index}"
								label="Not listed? Which profession?"
								type="text"
								placeholder="Their profession"
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
{/if}

<!-- Always asked. Two references are a safeguarding control, not a question. -->
<Card.Root class="p-6 md:p-8">
	<div class="mb-2 flex items-center gap-3">
		<UserRound class="size-5 text-primary" />
		<h2 class="font-heading text-xl font-semibold">
			{staff ? 'References' : 'Two references'}
			{#if req}<span class="text-destructive">*</span>{/if}
		</h2>
	</div>
	<p class="mb-6 text-sm text-muted-foreground">
		{staff
			? 'People who can speak to their character, and who are not family. Both are contacted before any placement. A reference somebody has already telephoned is not replaced by anything typed here.'
			: 'People who know you well enough to speak to your character, and who are not family. We contact both before any placement.'}
	</p>

	<div class="flex flex-col gap-5">
		{#each $form.references ?? [] as reference, index (index)}
			<div class="rounded-lg border bg-muted/30 p-5">
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-sm font-medium">Reference {index + 1}</h3>
					{#if ($form.references?.length ?? 0) > minimumReferences}
						<Button type="button" variant="ghost" size="sm" onclick={() => removeReference(index)}>
							<Trash2 class="size-4" />
							Remove
						</Button>
					{/if}
				</div>

				<div class="grid gap-5 md:grid-cols-2">
					<div class="flex flex-col gap-2">
						<Label for="referenceName-{index}">
							Their full name {#if req}<span class="text-destructive">*</span>{/if}
						</Label>
						<Input id="referenceName-{index}" bind:value={reference.fullName} />
						{#if $errors.references?.[index]?.fullName}
							<p class="text-sm text-destructive">{$errors.references[index].fullName}</p>
						{/if}
					</div>
					<div class="flex flex-col gap-2">
						<Label for="referenceRelationship-{index}">
							{staff ? 'How they know them' : 'How do they know you?'}
							{#if req}<span class="text-destructive">*</span>{/if}
						</Label>
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

	{#if $errors.references?._errors}
		<p class="mt-3 text-sm text-destructive">{$errors.references._errors}</p>
	{/if}

	<div class="mt-5">
		<Button type="button" variant="outline" size="sm" onclick={addReference}>
			<Plus class="size-4" />
			Add {($form.references?.length ?? 0) ? 'another' : 'a'} reference
		</Button>
	</div>
</Card.Root>

<Card.Root class="p-6 md:p-8">
	<div class="mb-6 flex items-center gap-3">
		<ShieldCheck class="size-5 text-primary" />
		<h2 class="font-heading text-xl font-semibold">
			{staff ? 'Disclosure' : 'Last few things'}
		</h2>
	</div>

	<div class="flex flex-col gap-5">
		<div class="flex flex-col gap-3">
			<Label>
				{staff
					? 'Have they ever been convicted of a criminal offence?'
					: 'Have you ever been convicted of a criminal offence?'}
			</Label>
			<p class="text-sm text-muted-foreground">
				A conviction does not automatically rule anyone out. Not disclosing one does.
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

		<!-- The four declarations. Present only on the volunteer's own form:
		     `adminDetailsSchema` does not carry them, because a consent
		     timestamp records the moment a person agreed and no staff member
		     can agree on their behalf. -->
		{#if has('consentBackgroundCheck')}
			<CheckboxField
				{errors}
				bind:checked={$form.consentBackgroundCheck}
				name="consentBackgroundCheck"
			>
				<span class="text-destructive">*</span> I consent to the Foundation carrying out background
				and reference checks, and to my details being handled as set out in the
				<a href="/privacy" class="underline underline-offset-2">privacy policy</a>.
			</CheckboxField>

			<CheckboxField {errors} bind:checked={$form.agreeCodeOfConduct} name="agreeCodeOfConduct">
				<span class="text-destructive">*</span> I have read and accept the volunteer code of conduct.
			</CheckboxField>

			<CheckboxField {errors} bind:checked={$form.declareAccurate} name="declareAccurate">
				<span class="text-destructive">*</span> I confirm that everything I have entered above is accurate
				and complete.
			</CheckboxField>

			<CheckboxField
				{errors}
				bind:checked={$form.acknowledgeNoGuarantee}
				name="acknowledgeNoGuarantee"
			>
				<span class="text-destructive">*</span> I understand that sending this does not guarantee a placement.
				Every application goes through safeguarding checks, and we can only place volunteers where there
				is a role to fill.
			</CheckboxField>
		{/if}
	</div>
</Card.Root>
