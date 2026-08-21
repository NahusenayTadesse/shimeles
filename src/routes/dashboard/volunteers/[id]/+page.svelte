<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import StatusBadge from '$lib/dashboard/status-badge.svelte';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import { ArrowLeft, Mail, Phone, ShieldAlert, ShieldCheck, UserRoundCheck } from '@lucide/svelte';

	let { data, form } = $props();

	const a = $derived(data.application);

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.ok) toast.success('Saved');
	});

	let statusId = $state('');
	let reviewerId = $state('');
	$effect(() => {
		statusId = a.statusId ? String(a.statusId) : '';
		reviewerId = a.reviewerId ?? '';
	});

	/**
	 * The approve option is removed from the picker while the gate is shut,
	 * rather than shown and rejected. The server refuses it either way — this is
	 * so a coordinator is not invited to try something that cannot work.
	 */
	const statusItems = $derived(
		data.statuses
			.filter((status) => status.stage !== 'approved' || data.canApprove)
			.map((status) => ({ value: String(status.id), name: status.label }))
	);

	const reviewerItems = $derived([
		{ value: '', name: 'Unassigned' },
		...data.reviewers.map((row) => ({ value: row.id, name: row.name }))
	]);

	const pillarItems = $derived(
		data.pillarOptions.map((pillar) => ({ value: String(pillar.id), name: pillar.name }))
	);

	const done = $derived(data.checklist.filter((item) => item.done).length);

	const PROFICIENCY_LABELS: Record<string, string> = {
		basic: 'some experience',
		intermediate: 'confident',
		advanced: 'very experienced',
		professional: 'their profession'
	};

	const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const dayName = (day: number | null) => (day === null ? 'Any day' : DAY_NAMES[day]);

	/** Claimed skills, grouped under their catalogue heading. */
	const skillsByCategory = $derived.by(() => {
		const names = [...new Set(data.claimedSkills.map((skill) => skill.categoryName ?? 'Other'))];
		return names.map((name) => ({
			name,
			skills: data.claimedSkills.filter((skill) => (skill.categoryName ?? 'Other') === name)
		}));
	});

	const CREDENTIAL_LABELS: Record<string, string> = {
		pending: 'Not yet checked',
		verified: 'Verified',
		rejected: 'Rejected',
		expired: 'Expired'
	};

	const CREDENTIAL_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
		pending: 'secondary',
		verified: 'outline',
		rejected: 'destructive',
		expired: 'destructive'
	};

	const CREDENTIAL_OUTCOMES = [
		{ value: 'verified', name: 'Verified' },
		{ value: 'rejected', name: 'Rejected' },
		{ value: 'expired', name: 'Expired' },
		{ value: 'pending', name: 'Reset' }
	];

	const REFERENCE_LABELS: Record<string, string> = {
		pending: 'Not yet contacted',
		contacted: 'Contacted, waiting',
		satisfactory: 'Satisfactory',
		unsatisfactory: 'Unsatisfactory',
		unreachable: 'Could not reach'
	};

	const REFERENCE_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
		pending: 'secondary',
		contacted: 'secondary',
		satisfactory: 'outline',
		unsatisfactory: 'destructive',
		unreachable: 'destructive'
	};

	const REFERENCE_OUTCOMES = [
		{ value: 'contacted', name: 'Contacted' },
		{ value: 'satisfactory', name: 'Satisfactory' },
		{ value: 'unsatisfactory', name: 'Unsatisfactory' },
		{ value: 'unreachable', name: 'Unreachable' }
	];

	const verifiedCount = $derived(
		data.credentials.filter((credential) => credential.verificationStatus === 'verified').length
	);

	const satisfactoryCount = $derived(
		data.references.filter((reference) => reference.status === 'satisfactory').length
	);

	/** A licence whose expiry has passed, whatever its recorded status says. */
	const isExpired = (expiresOn: string | null) =>
		Boolean(expiresOn) && new Date(expiresOn!) < new Date();

	const fmt = (value: Date | string | null) =>
		value
			? new Intl.DateTimeFormat('en-GB', {
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				}).format(new Date(value))
			: '';
</script>

<svelte:head><title>{a.fullName} · Volunteers</title></svelte:head>

<div class="flex flex-col gap-4">
	<a
		href="/dashboard/volunteers"
		class={buttonVariants({ variant: 'ghost', size: 'sm', class: 'w-fit' })}
	>
		<ArrowLeft class="size-4" /> Back to volunteers
	</a>

	<div class="flex flex-col gap-2">
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-mono text-sm text-muted-foreground">{a.reference}</span>
			<StatusBadge label={a.statusLabel} color={a.statusColor} />
			{#if data.isProfessional}
				<Badge variant={a.credentialsVerified ? 'outline' : 'destructive'}>
					{a.credentialsVerified ? 'Credentials verified' : 'Credentials unverified'}
				</Badge>
			{/if}
		</div>
		<h1 class="font-heading text-2xl font-bold">{a.fullName}</h1>
		<p class="text-sm text-muted-foreground">
			Applied {fmt(a.createdAt)}{a.regionName ? ` · ${a.regionName}` : ''}
		</p>
	</div>

	{#if !data.canApprove}
		<Alert.Root variant="destructive">
			<ShieldAlert class="size-4" />
			<Alert.Title>Approval is blocked</Alert.Title>
			<Alert.Description>
				{#if !a.safeguardingChecklistComplete}
					{done} of {data.checklist.length} safeguarding checks are complete. This volunteer cannot be
					approved or placed until all of them are.
				{:else}
					This volunteer lists professional credentials, which must be verified with the issuing
					body before approval.
				{/if}
			</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
		<div class="flex flex-col gap-4">
			<!-- The safeguarding checklist -->
			<Card.Root class="p-6">
				<div class="mb-4 flex items-center justify-between gap-2">
					<h2 class="font-heading text-lg font-semibold">Safeguarding checklist</h2>
					<Badge variant={data.canApprove ? 'outline' : 'secondary'}>
						{done} / {data.checklist.length}
					</Badge>
				</div>

				<div class="flex flex-col gap-2">
					{#each data.checklist as item (item.id)}
						<form
							method="post"
							action="?/toggleCheck"
							use:enhance={() =>
								async ({ update }) =>
									await update({ reset: false })}
							class="flex items-start gap-3 rounded-lg border p-3"
						>
							<input type="hidden" name="itemId" value={item.id} />
							<button type="submit" class="mt-0.5" aria-label={`Toggle ${item.label}`}>
								<Checkbox checked={Boolean(item.done)} />
							</button>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium">
									{item.label}
									{#if item.professionalOnly}
										<Badge variant="secondary" class="ml-2 h-4 px-1.5 text-[10px]">
											Professional only
										</Badge>
									{/if}
								</p>
								{#if item.description}
									<p class="mt-1 text-xs text-muted-foreground">{item.description}</p>
								{/if}
								{#if item.done}
									<p class="mt-1 text-xs text-success">
										Completed by {item.done.byName ?? 'a coordinator'} on {fmt(
											item.done.completedAt
										)}
									</p>
								{/if}
							</div>
						</form>
					{/each}
				</div>

				<p class="mt-4 text-xs text-muted-foreground">
					Adding a check on the checklist configuration screen re-opens this gate for volunteers who
					were approved against a shorter list — deliberately so.
				</p>
			</Card.Root>

			<!-- Skills and availability, from the catalogue joins -->
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">What they offer</h2>

				<div class="mb-5">
					<h3 class="mb-2 text-xs tracking-wide text-muted-foreground uppercase">Programmes</h3>
					<div class="flex flex-wrap gap-1">
						{#each data.interests as interest (interest.id)}
							<Badge variant="secondary">{interest.name}</Badge>
						{:else}
							<span class="text-sm text-muted-foreground">Not stated</span>
						{/each}
					</div>
				</div>

				<div class="mb-5">
					<h3 class="mb-2 text-xs tracking-wide text-muted-foreground uppercase">Skills</h3>
					{#each skillsByCategory as group (group.name)}
						<div class="mb-3">
							<p class="mb-1 text-xs text-muted-foreground">{group.name}</p>
							<div class="flex flex-wrap gap-1">
								{#each group.skills as skill (skill.id)}
									<Badge variant={skill.requiresCredential ? 'default' : 'outline'}>
										{skill.name}
										<span class="ml-1 opacity-70">· {PROFICIENCY_LABELS[skill.proficiency]}</span>
									</Badge>
								{/each}
							</div>
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">
							No catalogue skills — this application predates the structured form.
						</p>
					{/each}

					{#if (a.skills ?? []).length}
						<p class="mt-2 text-sm">
							<span class="text-muted-foreground">Also mentioned:</span>
							{(a.skills ?? []).join(', ')}
						</p>
					{/if}
				</div>

				<div>
					<h3 class="mb-2 text-xs tracking-wide text-muted-foreground uppercase">Availability</h3>
					{#if data.availability.length}
						<div class="flex flex-wrap gap-1">
							{#each data.availability as slot (slot.id)}
								<Badge variant="outline">
									{dayName(slot.dayOfWeek)}
									{slot.label}
									{#if slot.startTime && slot.endTime}
										<span class="ml-1 opacity-70">{slot.startTime}–{slot.endTime}</span>
									{/if}
								</Badge>
							{/each}
						</div>
					{/if}

					<dl class="mt-3 grid gap-3 text-sm sm:grid-cols-3">
						<div>
							<dt class="text-xs text-muted-foreground">Hours a week</dt>
							<dd>{a.hoursPerWeek ?? '—'}</dd>
						</div>
						<div>
							<dt class="text-xs text-muted-foreground">Commitment</dt>
							<dd>{a.commitmentMonths ? `${a.commitmentMonths} months` : 'Open-ended'}</dd>
						</div>
						<div>
							<dt class="text-xs text-muted-foreground">Can start</dt>
							<dd>{a.availableFrom ?? '—'}</dd>
						</div>
					</dl>

					{#if a.availability}
						<p class="mt-3 text-sm whitespace-pre-wrap text-muted-foreground">{a.availability}</p>
					{/if}
				</div>
			</Card.Root>

			<!-- Credentials, one verification decision each -->
			{#if data.credentials.length}
				<Card.Root class="p-6">
					<div class="mb-4 flex items-center justify-between gap-2">
						<h2 class="font-heading text-lg font-semibold">Professional credentials</h2>
						<Badge variant={a.credentialsVerified ? 'outline' : 'destructive'}>
							{verifiedCount} / {data.credentials.length} verified
						</Badge>
					</div>

					<p class="mb-4 text-xs text-muted-foreground">
						Verify each licence with its issuing body. The application's overall credential status
						is derived from these — every one must be verified before approval or placement.
					</p>

					<div class="flex flex-col gap-3">
						{#each data.credentials as credential (credential.id)}
							<div class="rounded-lg border p-4">
								<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
									<p class="font-medium">
										{credential.professionName ??
											credential.otherProfession ??
											'Unnamed profession'}
										{#if !credential.professionName && credential.otherProfession}
											<Badge variant="secondary" class="ml-2 h-4 px-1.5 text-[10px]">
												Not in the catalogue
											</Badge>
										{/if}
									</p>
									<Badge variant={CREDENTIAL_VARIANT[credential.verificationStatus]}>
										{CREDENTIAL_LABELS[credential.verificationStatus]}
									</Badge>
								</div>

								<dl class="grid gap-2 text-sm sm:grid-cols-2">
									<div>
										<dt class="text-xs text-muted-foreground">Licence number</dt>
										<dd class="font-mono">{credential.licenseNumber ?? '—'}</dd>
									</div>
									<div>
										<dt class="text-xs text-muted-foreground">Issued by</dt>
										<dd>{credential.licensingBody ?? '—'}</dd>
									</div>
									<div>
										<dt class="text-xs text-muted-foreground">Specialisation</dt>
										<dd>{credential.specialization ?? '—'}</dd>
									</div>
									<div>
										<dt class="text-xs text-muted-foreground">Valid</dt>
										<dd>
											{credential.issuedOn ?? '—'}{credential.expiresOn
												? ` → ${credential.expiresOn}`
												: ''}
											{#if isExpired(credential.expiresOn)}
												<Badge variant="destructive" class="ml-2 h-4 px-1.5 text-[10px]">
													Expired
												</Badge>
											{/if}
										</dd>
									</div>
								</dl>

								{#if credential.verifiedAt}
									<p class="mt-2 text-xs text-muted-foreground">
										{CREDENTIAL_LABELS[credential.verificationStatus]} by
										{credential.verifiedByName ?? 'a coordinator'} on {fmt(credential.verifiedAt)}
										{#if credential.verificationNote}
											— {credential.verificationNote}
										{/if}
									</p>
								{/if}

								<form
									method="post"
									action="?/verifyCredential"
									use:enhance={() =>
										async ({ update }) =>
											await update({ reset: true })}
									class="mt-3 flex flex-wrap items-end gap-2"
								>
									<input type="hidden" name="credentialId" value={credential.id} />
									<Input
										name="note"
										placeholder="Who did you speak to?"
										class="h-8 max-w-xs flex-1"
									/>
									{#each CREDENTIAL_OUTCOMES as outcome (outcome.value)}
										<Button
											type="submit"
											name="status"
											value={outcome.value}
											size="sm"
											variant={credential.verificationStatus === outcome.value
												? 'default'
												: 'outline'}
										>
											{outcome.name}
										</Button>
									{/each}
								</form>
							</div>
						{/each}
					</div>
				</Card.Root>
			{:else if a.professionalCredentials}
				<!-- Legacy: a paragraph rather than rows. -->
				<Card.Root class="p-6">
					<h2 class="mb-2 font-heading text-lg font-semibold">Professional credentials</h2>
					<p class="text-sm whitespace-pre-wrap">{a.professionalCredentials}</p>
					<p class="mt-3 text-xs text-muted-foreground">
						Taken through the old form, so there is nothing per-licence to verify. Use the
						credentials flag in the sidebar.
					</p>
				</Card.Root>
			{/if}

			<!-- References, one outcome each -->
			<Card.Root class="p-6">
				<div class="mb-4 flex items-center justify-between gap-2">
					<h2 class="font-heading text-lg font-semibold">References</h2>
					{#if data.references.length}
						<Badge variant={a.referencesChecked ? 'outline' : 'secondary'}>
							{satisfactoryCount} / {data.references.length} satisfactory
						</Badge>
					{/if}
				</div>

				<div class="flex flex-col gap-3">
					{#each data.references as reference (reference.id)}
						<div class="rounded-lg border p-4">
							<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
								<div>
									<p class="font-medium">{reference.fullName}</p>
									<p class="text-xs text-muted-foreground">
										{reference.relationship ?? 'Relationship not stated'}{reference.organization
											? ` · ${reference.organization}`
											: ''}
									</p>
								</div>
								<Badge variant={REFERENCE_VARIANT[reference.status]}>
									{REFERENCE_LABELS[reference.status]}
								</Badge>
							</div>

							<div class="flex flex-wrap gap-3 text-sm">
								{#if reference.phone}
									<a
										href={`tel:${reference.phone}`}
										class="flex items-center gap-1 hover:text-primary"
									>
										<Phone class="size-3.5 text-muted-foreground" />{reference.phone}
									</a>
								{/if}
								{#if reference.email}
									<a
										href={`mailto:${reference.email}`}
										class="flex items-center gap-1 hover:text-primary"
									>
										<Mail class="size-3.5 text-muted-foreground" />{reference.email}
									</a>
								{/if}
							</div>

							{#if reference.contactedAt}
								<p class="mt-2 text-xs text-muted-foreground">
									Contacted by {reference.contactedByName ?? 'a coordinator'} on
									{fmt(reference.contactedAt)}
									{#if reference.responseNote}
										— {reference.responseNote}
									{/if}
								</p>
							{/if}

							<form
								method="post"
								action="?/updateReference"
								use:enhance={() =>
									async ({ update }) =>
										await update({ reset: true })}
								class="mt-3 flex flex-wrap items-end gap-2"
							>
								<input type="hidden" name="referenceId" value={reference.id} />
								<Input
									name="responseNote"
									placeholder="What did they say?"
									class="h-8 max-w-xs flex-1"
								/>
								{#each REFERENCE_OUTCOMES as outcome (outcome.value)}
									<Button
										type="submit"
										name="status"
										value={outcome.value}
										size="sm"
										variant={reference.status === outcome.value ? 'default' : 'outline'}
									>
										{outcome.name}
									</Button>
								{/each}
							</form>
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">
							No reference records — this application predates the structured form.
						</p>
					{/each}
				</div>
			</Card.Root>

			<!-- Everything else they told us -->
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">Their application</h2>
				<dl class="grid gap-4 sm:grid-cols-2">
					{#if a.motivation}
						<div class="sm:col-span-2">
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">
								Why they want to volunteer
							</dt>
							<dd class="mt-1 text-sm whitespace-pre-wrap">{a.motivation}</dd>
						</div>
					{/if}
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">Lives in</dt>
						<dd class="mt-1 text-sm">
							{a.city ?? '—'}{a.country ? ` · ${a.country}` : ''}
						</dd>
					</div>
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">Occupation</dt>
						<dd class="mt-1 text-sm">{a.occupation ?? '—'}</dd>
					</div>
					{#if a.organisationName}
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">
								Applying through
							</dt>
							<dd class="mt-1 text-sm">{a.organisationName}</dd>
						</div>
					{/if}
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">Date of birth</dt>
						<dd class="mt-1 text-sm">{a.dateOfBirth ?? '—'}</dd>
					</div>
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">Heard about us</dt>
						<dd class="mt-1 text-sm">{a.heardAbout ?? '—'}</dd>
					</div>
					<div class="sm:col-span-2">
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">Emergency contact</dt>
						<dd class="mt-1 text-sm">
							{#if a.emergencyContactName}
								{a.emergencyContactName}
								{#if a.emergencyContactRelationship}
									<span class="text-muted-foreground">({a.emergencyContactRelationship})</span>
								{/if}
								· {a.emergencyContactPhone ?? 'no number'}
							{:else}
								—
							{/if}
						</dd>
					</div>

					<!-- The declarations. Shown as dates, because "when did they
					     consent" is the question a safeguarding audit asks. -->
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">
							Background check consent
						</dt>
						<dd class="mt-1 text-sm">
							{a.backgroundCheckConsentAt ? fmt(a.backgroundCheckConsentAt) : 'Not given'}
						</dd>
					</div>
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">
							Code of conduct accepted
						</dt>
						<dd class="mt-1 text-sm">
							{a.codeOfConductAgreedAt ? fmt(a.codeOfConductAgreedAt) : 'Not accepted'}
						</dd>
					</div>
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">Declared accurate</dt>
						<dd class="mt-1 text-sm">
							{a.declaredAccurateAt ? fmt(a.declaredAccurateAt) : 'Not declared'}
						</dd>
					</div>
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">
							Understood no guarantee
						</dt>
						<dd class="mt-1 text-sm">
							{a.acknowledgedNoGuaranteeAt ? fmt(a.acknowledgedNoGuaranteeAt) : 'Not acknowledged'}
						</dd>
					</div>

					{#if a.hasPriorConviction !== null}
						<div class="sm:col-span-2">
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">
								Declared conviction
							</dt>
							<dd class="mt-1 text-sm">
								{#if a.hasPriorConviction}
									<Badge variant="secondary" class="mb-1">Disclosed</Badge>
									<p class="whitespace-pre-wrap">{a.priorConvictionDetail ?? '—'}</p>
								{:else}
									None declared
								{/if}
							</dd>
						</div>
					{/if}

					{#each Object.entries(a.data ?? {}) as [key, value] (key)}
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">
								{key.replace(/_/g, ' ')}
							</dt>
							<dd class="mt-1 text-sm whitespace-pre-wrap">
								{Array.isArray(value) ? value.join(', ') : String(value)}
							</dd>
						</div>
					{/each}
				</dl>
			</Card.Root>

			<!-- Placements -->
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">Placements</h2>

				{#each data.placements as placement (placement.id)}
					<div class="mb-2 rounded-lg border p-3 text-sm">
						<p class="font-medium">{placement.pillarName ?? 'General'}</p>
						<p class="text-muted-foreground">{placement.roleDescription}</p>
						<p class="mt-1 text-xs text-muted-foreground">
							From {placement.startedAt ?? '—'}{placement.endedAt ? ` to ${placement.endedAt}` : ''}
						</p>
					</div>
				{:else}
					<p class="mb-4 text-sm text-muted-foreground">Not placed yet.</p>
				{/each}

				{#if data.canApprove}
					<Separator class="my-4" />
					<form
						method="post"
						action="?/addPlacement"
						use:enhance={() =>
							async ({ update }) =>
								await update({ reset: true })}
						class="flex flex-col gap-2"
					>
						<SelectComp name="pillarId" items={pillarItems} value="" />
						<Input name="roleDescription" placeholder="What will they do?" />
						<Input name="startedAt" type="date" />
						<Button type="submit" size="sm" class="w-fit">
							<UserRoundCheck class="size-4" /> Add placement
						</Button>
					</form>
				{:else}
					<p class="text-xs text-muted-foreground">
						Placement unlocks once safeguarding is complete — that is the point at which a volunteer
						would meet a beneficiary.
					</p>
				{/if}
			</Card.Root>
		</div>

		<div class="flex flex-col gap-4">
			<Card.Root class="p-5">
				<h2 class="mb-3 font-heading text-base font-semibold">Workflow</h2>

				<form
					method="post"
					action="?/setStatus"
					use:enhance={() =>
						async ({ update }) =>
							await update({ reset: false })}
					class="mb-4 flex flex-col gap-2"
				>
					<SelectComp name="statusId" items={statusItems} bind:value={statusId} />
					<Button type="submit" size="sm">Update status</Button>
				</form>

				<Separator class="my-3" />

				<form
					method="post"
					action="?/assign"
					use:enhance={() =>
						async ({ update }) =>
							await update({ reset: false })}
					class="flex flex-col gap-2"
				>
					<span class="text-xs text-muted-foreground">Reviewer</span>
					<SelectComp name="reviewerId" items={reviewerItems} bind:value={reviewerId} />
					<Button type="submit" size="sm" variant="outline">Assign</Button>
				</form>
			</Card.Root>

			<Card.Root class="p-5">
				<h2 class="mb-3 font-heading text-base font-semibold">Checks</h2>

				<!-- Both flags are derived from the rows below once an application
				     has them, so this card reports rather than sets. The manual
				     buttons appear only for applications taken through the old
				     form, which have nothing per-item to record against. -->
				<div class="mb-3 flex items-center justify-between gap-2 text-sm">
					<span class="text-muted-foreground">References</span>
					{#if a.referencesChecked}
						<span class="flex items-center gap-1 text-success">
							<ShieldCheck class="size-4" /> Checked
						</span>
					{:else}
						<span class="text-muted-foreground">
							{satisfactoryCount} / {data.references.length || '—'}
						</span>
					{/if}
				</div>

				{#if !data.references.length}
					<form
						method="post"
						action="?/setLegacyChecks"
						use:enhance={() =>
							async ({ update }) =>
								await update({ reset: false })}
						class="mb-3"
					>
						<input type="hidden" name="field" value="references" />
						<input type="hidden" name="checked" value={String(!a.referencesChecked)} />
						<Button
							type="submit"
							size="sm"
							variant={a.referencesChecked ? 'outline' : 'default'}
							class="w-full"
						>
							{a.referencesChecked ? 'Undo references checked' : 'Mark references checked'}
						</Button>
					</form>
				{/if}

				{#if data.isProfessional}
					<Separator class="my-3" />

					<div class="mb-3 flex items-center justify-between gap-2 text-sm">
						<span class="text-muted-foreground">Credentials</span>
						{#if a.credentialsVerified}
							<span class="flex items-center gap-1 text-success">
								<ShieldCheck class="size-4" /> Verified
							</span>
						{:else}
							<span class="text-muted-foreground">
								{verifiedCount} / {data.credentials.length || '—'}
							</span>
						{/if}
					</div>

					{#if !data.credentials.length}
						<form
							method="post"
							action="?/setLegacyChecks"
							use:enhance={() =>
								async ({ update }) =>
									await update({ reset: false })}
						>
							<input type="hidden" name="field" value="credentials" />
							<input type="hidden" name="verified" value="" />
							<input type="hidden" name="checked" value={String(!a.credentialsVerified)} />
							<Button
								type="submit"
								size="sm"
								variant={a.credentialsVerified ? 'outline' : 'default'}
								class="w-full"
							>
								{a.credentialsVerified ? 'Undo credentials verified' : 'Mark credentials verified'}
							</Button>
						</form>
					{/if}
				{/if}
			</Card.Root>

			<Card.Root class="p-5">
				<h2 class="mb-3 font-heading text-base font-semibold">Contact</h2>
				<div class="flex flex-col gap-2 text-sm">
					{#if a.phone}
						<a href={`tel:${a.phone}`} class="flex items-center gap-2 hover:text-primary">
							<Phone class="size-4 text-muted-foreground" />{a.phone}
						</a>
					{/if}
					{#if a.email}
						<a href={`mailto:${a.email}`} class="flex items-center gap-2 hover:text-primary">
							<Mail class="size-4 text-muted-foreground" />{a.email}
						</a>
					{/if}
				</div>
			</Card.Root>
		</div>
	</div>
</div>
