<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import ActionNote from '$lib/dashboard/action-note.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import StatusBadge from '$lib/dashboard/status-badge.svelte';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import { assetUrl } from '$lib/assets';
	import { formatMoney, sumByCurrency } from '$lib/money';
	import { formatDateTime } from '$lib/dates';
	import { genderLabel } from '$lib/gender';
	import {
		ArrowLeft,
		FileText,
		Image as ImageIcon,
		Link2,
		Mail,
		MessageSquarePlus,
		Phone,
		Send,
		ShieldCheck,
		TriangleAlert,
		UserRound
	} from '@lucide/svelte';

	let { data, form } = $props();

	const s = $derived(data.submission);

	const URGENCY_LABELS: Record<string, string> = {
		whenever: 'Whenever',
		weeks: 'Within weeks',
		days: 'Within days',
		immediate: 'Emergency'
	};

	/** A null here means "they did not say", which is not the same as "no". */
	const yesNoUnknown = (value: boolean | null) =>
		value === null ? 'Not stated' : value ? 'Yes' : 'No';

	/**
	 * Whether the case has reached a stage where "accept" is the natural word.
	 * Deliberately only wording: linking is allowed at any point, because a
	 * caseworker often identifies the person long before the decision is made.
	 */
	const acceptable = $derived(['approved', 'active'].includes(s.statusStage ?? ''));

	/**
	 * Only the needs that carry an estimate; the rest contribute nothing.
	 *
	 * One total per currency: a need priced in dollars and a need priced in
	 * birr are two asks, and the assumed-ETB figure this used to render was
	 * neither of them.
	 */
	const totalRequested = $derived(
		sumByCurrency(
			data.needs,
			(need) => need.estimatedAmount,
			(need) => need.currency
		)
	);

	/**
	 * Why an automatic notification did not go out, in words a coordinator can
	 * act on. Only reached when one was actually asked for.
	 */
	const NOTIFY_FAILURES: Record<string, string> = {
		'no-email': 'this applicant gave no email address',
		'nothing-to-say': 'that status has no public description and you left the note empty',
		'no-smtp': 'no mail server is configured on this installation',
		'send-failed': 'the mail server rejected it'
	};

	/** The last outcome, kept on screen after the toast has gone (§11). */
	let lastAction = $state<{ message: string; at: number } | null>(null);

	/** Whether a reply can be emailed at all. Drives the second button. */
	const applicantEmail = $derived(s.email ?? null);

	/**
	 * Whether the status the case is on has wording of its own.
	 *
	 * It decides what "Notify applicant" will actually send — the Foundation's
	 * description of this status, or just the caseworker's note — so the line
	 * under the button says which, before it is pressed rather than after.
	 */
	const currentStatusDescribed = $derived(
		Boolean(data.statuses.find((row) => row.id === s.statusId)?.publicDescription?.trim())
	);

	/**
	 * The global "notify on every status change" switch.
	 *
	 * Held locally so the box moves the instant it is clicked, and posted by the
	 * form it sits in. `tick()` matters: the hidden input carrying the new value
	 * is rendered from this state, and submitting before Svelte has flushed the
	 * change would post the old one — turning the switch into a no-op that looks
	 * like it worked.
	 */
	let autoNotifyForm = $state<HTMLFormElement | null>(null);
	// Writable derived: it follows the server's value on every load, and a click
	// can move it ahead of that until the post comes back with the truth.
	let autoNotify = $derived(data.autoNotify);

	async function toggleAutoNotify(checked: boolean) {
		autoNotify = checked;
		await tick();
		autoNotifyForm?.requestSubmit();
	}

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.warning) {
			// A reply that was saved but not sent is the one outcome staff must
			// not read as success — it stays on screen rather than fading.
			toast.warning(form.warning);
			lastAction = { message: form.warning, at: Date.now() };
		} else if (form?.emailed) {
			toast.success('Reply sent to the applicant.');
			lastAction = { message: 'Reply sent to the applicant.', at: Date.now() };
		} else if (form?.notified) {
			toast.success(`Emailed ${applicantEmail}.`);
			lastAction = { message: `Emailed ${applicantEmail}.`, at: Date.now() };
		} else if (form?.ok && form?.notifyReason && form.notifyReason !== 'not-requested') {
			// The status moved but the letter did not go. Staff have to be told
			// which of the two happened, or they will believe the family knows.
			const why = NOTIFY_FAILURES[form.notifyReason] ?? 'it could not be sent';
			toast.warning(`Status updated, but nothing was emailed: ${why}.`);
			lastAction = { message: `Status updated. Nothing was emailed: ${why}.`, at: Date.now() };
		} else if (form?.ok) {
			toast.success('Saved');
			lastAction = { message: 'Saved.', at: Date.now() };
		}
	});

	let statusId = $state<string>('');
	let reviewerId = $state<string>('');
	let priority = $state<string>('normal');

	$effect(() => {
		statusId = s.statusId ? String(s.statusId) : '';
		reviewerId = s.reviewerId ?? '';
		priority = s.priority;
	});

	const statusItems = $derived(
		data.statuses.map((row) => ({ value: String(row.id), name: row.label }))
	);
	const reviewerItems = $derived([
		{ value: '', name: 'Unassigned' },
		...data.reviewers.map((row) => ({ value: row.id, name: row.name }))
	]);
	/**
	 * The triage categories on the registration form — urgent, standard,
	 * deferred — mapped onto the priority column that already existed. `normal`
	 * is what the form calls "standard"; the label says so, the value does not
	 * change, and nothing stored has to be rewritten.
	 */
	const priorityItems = [
		{ value: 'urgent', name: 'Urgent' },
		{ value: 'high', name: 'High' },
		{ value: 'normal', name: 'Standard' },
		{ value: 'low', name: 'Low' },
		{ value: 'deferred', name: 'Deferred' }
	];

	/**
	 * Renders one stored answer using the field definition that produced it, so
	 * a select shows "Help with treatment costs" rather than `treatment_cost`.
	 */
	function display(field: (typeof data.fields)[number]): string {
		const value = (s.data ?? {})[field.fieldKey];
		if (value == null || value === '') return '-';

		if (field.fieldType === 'select' || field.fieldType === 'multiselect') {
			const options = field.options ?? [];
			const values = Array.isArray(value) ? value : String(value).split(',');
			return values
				.map((raw) => options.find((option) => option.value === String(raw).trim())?.label ?? raw)
				.join(', ');
		}

		if (field.fieldType === 'checkbox') return value ? 'Yes' : 'No';
		if (Array.isArray(value)) return value.join(', ');
		return String(value);
	}

	const answeredFields = $derived(data.fields.filter((field) => field.fieldType !== 'heading'));

	const fmt = (value: Date | string | null) => formatDateTime(value, '');
</script>

<svelte:head><title>{s.reference} · Dashboard</title></svelte:head>

{#if lastAction}
	<div class="mx-auto mb-3 w-full">
		<ActionNote message={lastAction.message} at={lastAction.at} />
	</div>
{/if}

<div class="flex flex-col gap-4">
	<a
		href="/dashboard/applications"
		class={buttonVariants({ variant: 'ghost', size: 'sm', class: 'w-fit' })}
	>
		<ArrowLeft class="size-4" /> Back to applications
	</a>

	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="flex flex-col gap-2">
			<div class="flex flex-wrap items-center gap-2">
				<span class="font-mono text-sm text-muted-foreground">{s.reference}</span>
				<StatusBadge label={s.statusLabel} color={s.statusColor} />
				{#if s.pillarName}<Badge variant="secondary">{s.pillarName}</Badge>{/if}
				{#if s.priority !== 'normal'}
					<!-- Deferred is a triage decision, not an alarm, so it reads as an
					     outline badge alongside low rather than in red. -->
					<Badge
						variant={s.priority === 'low' || s.priority === 'deferred' ? 'outline' : 'destructive'}
						class="capitalize"
					>
						{s.priority}
					</Badge>
				{/if}
			</div>
			<h1 class="font-heading text-2xl font-bold">{s.name || 'Anonymous applicant'}</h1>
			<p class="text-sm text-muted-foreground">
				{s.formName} · received {fmt(s.createdAt)}{s.regionName ? ` · ${s.regionName}` : ''}
			</p>
		</div>
	</div>

	{#if s.isLowBarrier}
		<!-- Mental Wellness and anything like it. Stated on the case file so a
		     caseworker does not chase an applicant for details they were
		     explicitly told they need not give. -->
		<Alert.Root>
			<ShieldCheck class="size-4" />
			<Alert.Title>Low-barrier request</Alert.Title>
			<Alert.Description>
				This person was told they did not need to prove anything or share contact details. Missing
				fields here are the design working, not an incomplete application.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
		<div class="flex flex-col gap-4">
			<!-- Who is being helped. Present only for applications taken through
			     `/apply`; a case from the form builder has no subject row, and the
			     absence of this card is the honest signal that it arrived that way. -->
			{#if data.subject}
				{@const subject = data.subject}
				<Card.Root class="p-6">
					<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
						<h2 class="font-heading text-lg font-semibold">Who needs help</h2>
						<Badge variant={subject.applyingFor === 'other' ? 'default' : 'secondary'}>
							{subject.applyingFor === 'other'
								? `Applied for by ${s.name ?? 'someone else'}${subject.relationship ? `, ${subject.relationship}` : ''}`
								: 'Applying for themselves'}
						</Badge>
					</div>

					{#if !subject.safeToContact}
						<Alert.Root variant="destructive" class="mb-4">
							<TriangleAlert class="size-4" />
							<Alert.Title>Take care contacting them</Alert.Title>
							<Alert.Description>
								{subject.contactNotes ??
									'They asked us to be careful how we get in touch. Read the case before calling.'}
							</Alert.Description>
						</Alert.Root>
					{/if}

					<dl class="grid gap-4 sm:grid-cols-2">
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">Name</dt>
							<dd class="text-sm">{subject.fullName ?? '-'}</dd>
						</div>
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">Age</dt>
							<dd class="text-sm">
								{#if subject.dateOfBirth}
									{subject.dateOfBirth}
								{:else if subject.approximateAge}
									about {subject.approximateAge}
								{:else}
									-
								{/if}
							</dd>
						</div>
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">Gender</dt>
							<dd class="text-sm">{genderLabel(subject.gender)}</dd>
						</div>
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">Their phone</dt>
							<dd class="text-sm">
								{#if subject.phone}
									<a href={`tel:${subject.phone}`} class="hover:text-primary">{subject.phone}</a>
								{:else}
									-
								{/if}
							</dd>
						</div>
						<div class="sm:col-span-2">
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">Where</dt>
							<dd class="text-sm">
								{[subject.addressLine, subject.city, subject.regionName]
									.filter(Boolean)
									.join(', ') || '-'}
							</dd>
						</div>
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">Household</dt>
							<dd class="text-sm">
								{subject.householdSize ?? '-'} people{subject.dependantsCount !== null
									? `, ${subject.dependantsCount} dependants`
									: ''}
							</dd>
						</div>
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">Monthly income</dt>
							<dd class="text-sm">
								{subject.monthlyIncome !== null ? formatMoney(subject.monthlyIncome, 'ETB') : '-'}
								{#if subject.incomeSource}
									<span class="text-muted-foreground">· {subject.incomeSource}</span>
								{/if}
							</dd>
						</div>
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">Anyone working</dt>
							<dd class="text-sm">{yesNoUnknown(subject.isEmployed)}</dd>
						</div>
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">
								Disability or long-term illness
							</dt>
							<dd class="text-sm">{yesNoUnknown(subject.hasDisability)}</dd>
						</div>
						{#if subject.healthDetail}
							<div class="sm:col-span-2">
								<dt class="text-xs tracking-wide text-muted-foreground uppercase">Health detail</dt>
								<dd class="text-sm whitespace-pre-wrap">{subject.healthDetail}</dd>
							</div>
						{/if}
						{#if subject.otherSupport}
							<div class="sm:col-span-2">
								<dt class="text-xs tracking-wide text-muted-foreground uppercase">
									Help from elsewhere
								</dt>
								<dd class="text-sm whitespace-pre-wrap">{subject.otherSupport}</dd>
							</div>
						{/if}
					</dl>

					<Separator class="my-5" />

					<dl class="grid gap-4 sm:grid-cols-2">
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">
								Best time to call
							</dt>
							<dd class="text-sm">{subject.bestTimeToContact ?? '-'}</dd>
						</div>
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">Someone else</dt>
							<dd class="text-sm">
								{subject.alternateContactName ?? '-'}
								{#if subject.alternateContactPhone}
									· <a href={`tel:${subject.alternateContactPhone}`} class="hover:text-primary">
										{subject.alternateContactPhone}
									</a>
								{/if}
							</dd>
						</div>
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">Wrote in</dt>
							<dd class="text-sm">
								{#if subject.languageName}
									{subject.languageNativeName ?? subject.languageName}
									<span class="text-muted-foreground">({subject.languageName})</span>
								{:else}
									-
								{/if}
							</dd>
						</div>
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">Consent</dt>
							<dd class="text-sm">
								{subject.consentToStoreAt ? 'To store' : 'Not given'}{subject.consentToVerifyAt
									? ', to verify'
									: ''}
							</dd>
						</div>
						<div>
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">Declarations</dt>
							<dd class="text-sm">
								{#if subject.declaredAccurateAt || subject.acknowledgedNoGuaranteeAt}
									{[
										subject.declaredAccurateAt ? 'Accurate' : null,
										subject.acknowledgedNoGuaranteeAt ? 'No guarantee understood' : null
									]
										.filter(Boolean)
										.join(', ')}
								{:else}
									<!-- Applications taken before the declarations were added, and
									     any taken through the older dynamic form, have neither. -->
									Not recorded
								{/if}
							</dd>
						</div>
					</dl>
				</Card.Root>
			{/if}

			<!-- What they asked for, from the needs catalogue. -->
			{#if data.needs.length}
				<Card.Root class="p-6">
					<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
						<h2 class="font-heading text-lg font-semibold">What they are asking for</h2>
						{#each totalRequested as total (total.currency)}
							<Badge variant="outline">
								{formatMoney(total.amount, total.currency)} estimated
							</Badge>
						{/each}
					</div>

					<div class="flex flex-col gap-2">
						{#each data.needs as need (need.id)}
							<div class="rounded-lg border p-3">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<span class="text-sm font-medium">
										{need.name}
										{#if need.categoryName}
											<span class="font-normal text-muted-foreground">· {need.categoryName}</span>
										{/if}
									</span>
									<div class="flex items-center gap-2">
										{#if need.estimatedAmount !== null}
											<Badge variant="secondary">
												{formatMoney(need.estimatedAmount, need.currency)}
											</Badge>
										{/if}
										<Badge variant={need.urgency === 'immediate' ? 'destructive' : 'outline'}>
											{URGENCY_LABELS[need.urgency]}
										</Badge>
									</div>
								</div>
								{#if need.detail}
									<p class="mt-1 text-sm text-muted-foreground">{need.detail}</p>
								{/if}
								{#if need.evidenceHint}
									<p class="mt-1 text-xs text-muted-foreground">
										Usually evidenced by: {need.evidenceHint}
									</p>
								{/if}
							</div>
						{/each}
					</div>
				</Card.Root>
			{/if}

			<!-- The answers -->
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">What they told us</h2>
				<dl class="grid gap-4 sm:grid-cols-2">
					{#each answeredFields as field (field.fieldKey)}
						<div class="flex flex-col gap-1">
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">{field.label}</dt>
							<dd class="text-sm whitespace-pre-wrap">{display(field)}</dd>
						</div>
					{/each}
				</dl>
			</Card.Root>

			<!-- Documents. These stream through /files, which re-checks the pillar
			     scope and audits every download. -->
			{#if data.documents.length}
				<Card.Root class="p-6">
					<h2 class="mb-4 font-heading text-lg font-semibold">Documents</h2>
					<div class="flex flex-col gap-2">
						{#each data.documents as doc (doc.id)}
							<a
								href={assetUrl(doc.storagePath)}
								target="_blank"
								rel="noreferrer"
								class="flex items-center gap-3 rounded-lg border p-3 text-sm hover:bg-muted/50"
							>
								<div class="rounded-lg bg-muted p-2 text-primary">
									{#if doc.mimeType === 'application/pdf'}
										<FileText class="size-4" />
									{:else}
										<ImageIcon class="size-4" />
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<p class="truncate font-medium">{doc.label ?? doc.originalFilename}</p>
									<p class="text-xs text-muted-foreground">
										{(doc.sizeBytes / 1024 / 1024).toFixed(2)} MB
									</p>
								</div>
							</a>
						{/each}
					</div>
					<p class="mt-3 text-xs text-muted-foreground">
						Opening a document is recorded in the audit log.
					</p>
				</Card.Root>
			{/if}

			<!-- Case notes and replies -->
			<Card.Root class="p-6">
				<h2 class="mb-1 font-heading text-lg font-semibold">Case notes</h2>
				<p class="mb-4 text-sm text-muted-foreground">
					A note stays inside the Foundation. A reply is emailed to the applicant — the two buttons
					are the only thing that decides which, so read what you wrote before pressing the second
					one.
				</p>

				<form
					method="post"
					action="?/addNote"
					use:enhance={() =>
						async ({ update }) =>
							await update({ reset: true })}
					class="mb-5 flex flex-col gap-2"
				>
					<Textarea
						name="note"
						rows={3}
						placeholder="Write a note, or a reply to the applicant…"
						required
					/>
					<div class="flex flex-wrap items-center gap-2">
						<Button type="submit" size="sm" variant="secondary">
							<MessageSquarePlus class="size-4" /> Save internal note
						</Button>
						<!-- `send` is what tells the action which button was pressed. It is
						     never inferred from whether an address exists. -->
						<Button
							type="submit"
							size="sm"
							name="send"
							value="true"
							disabled={!applicantEmail}
							title={applicantEmail
								? `Emails ${applicantEmail}`
								: 'This applicant gave no email address'}
						>
							<Send class="size-4" /> Send reply to applicant
						</Button>
						{#if applicantEmail}
							<span class="text-xs text-muted-foreground">Replies go to {applicantEmail}</span>
						{:else}
							<span class="text-xs text-muted-foreground">
								No email address on this application, so only notes are possible.
							</span>
						{/if}
					</div>
				</form>

				<div class="flex flex-col gap-3">
					{#each data.notes as note (note.id)}
						<div
							class="rounded-lg border p-3 text-sm {note.isSystem
								? 'bg-muted/40 text-muted-foreground'
								: !note.isInternal
									? 'border-primary/30 bg-primary/5'
									: ''}"
						>
							<p class="whitespace-pre-wrap">{note.note}</p>
							<p class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
								<span>{note.authorName ?? 'System'} · {fmt(note.createdAt)}</span>
								<!-- A reply that did not send is the case staff most need to
								     spot, so it is labelled rather than left looking sent. -->
								{#if !note.isInternal}
									<Badge variant={note.sentAt ? 'default' : 'destructive'} class="text-[10px]">
										{note.sentAt ? `Emailed ${fmt(note.sentAt)}` : 'Not sent'}
									</Badge>
								{/if}
							</p>
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">No notes yet.</p>
					{/each}
				</div>
			</Card.Root>
		</div>

		<div class="flex flex-col gap-4">
			<!-- Workflow -->
			<Card.Root class="p-5">
				<h2 class="mb-3 font-heading text-base font-semibold">Workflow</h2>

				{#if data.canManageSettings}
					<!-- The standing policy, above the controls it governs. It applies to
					     every case and every volunteer application, not only this one,
					     which is why the label says so. -->
					<form
						method="post"
						action="?/setAutoNotify"
						bind:this={autoNotifyForm}
						use:enhance={() =>
							async ({ update }) =>
								await update({ reset: false })}
						class="mb-3 rounded-lg border bg-muted/30 p-3"
					>
						<input type="hidden" name="enabled" value={String(autoNotify)} />
						<label class="flex items-start gap-2 text-sm">
							<Checkbox checked={autoNotify} onCheckedChange={toggleAutoNotify} class="mt-0.5" />
							<span>
								Notify the applicant on all status changes
								<span class="mt-0.5 block text-xs text-muted-foreground">
									Applies to every application and volunteer, not just this one. A status with no
									public description still sends nothing unless you write a note.
								</span>
							</span>
						</label>
					</form>
				{/if}

				<form
					method="post"
					action="?/setStatus"
					use:enhance={() =>
						async ({ update }) =>
							await update({ reset: false })}
					class="mb-4 flex flex-col gap-2"
				>
					<SelectComp name="statusId" items={statusItems} bind:value={statusId} />
					<Textarea
						name="note"
						rows={2}
						placeholder="Why? (optional, saved as a case note — and sent if you notify)"
					/>
					<div class="flex flex-wrap gap-2">
						<Button type="submit" size="sm">Update status</Button>
						<!-- Same form, so the note above is the sentence that goes out.
						     `formaction` rather than a second form: a caseworker writing
						     "your documents arrived, nothing more is needed" should be able
						     to send exactly that without moving the case anywhere. -->
						<Button
							type="submit"
							formaction="?/notifyApplicant"
							size="sm"
							variant="outline"
							disabled={!applicantEmail}
						>
							<Mail class="size-4" /> Notify applicant
						</Button>
					</div>
					<p class="text-xs text-muted-foreground">
						{#if !applicantEmail}
							No email address on this application, so nobody can be notified.
						{:else if currentStatusDescribed}
							Emails {applicantEmail} what "{s.statusLabel}" means, plus your note.
						{:else}
							Emails {applicantEmail} your note above — "{s.statusLabel}" has no public description
							of its own.
						{/if}
					</p>
				</form>

				<Separator class="my-3" />

				<form
					method="post"
					action="?/assign"
					use:enhance={() =>
						async ({ update }) =>
							await update({ reset: false })}
					class="mb-4 flex flex-col gap-2"
				>
					<span class="text-xs text-muted-foreground">Reviewer</span>
					<SelectComp name="reviewerId" items={reviewerItems} bind:value={reviewerId} />
					<Button type="submit" size="sm" variant="outline">Assign</Button>
				</form>

				<form
					method="post"
					action="?/setPriority"
					use:enhance={() =>
						async ({ update }) =>
							await update({ reset: false })}
					class="flex flex-col gap-2"
				>
					<span class="text-xs text-muted-foreground">Priority</span>
					<SelectComp name="priority" items={priorityItems} bind:value={priority} />
					<Button type="submit" size="sm" variant="outline">Set priority</Button>
				</form>
			</Card.Root>

			<!-- Contact -->
			<Card.Root class="p-5">
				<h2 class="mb-3 font-heading text-base font-semibold">Contact</h2>
				<div class="flex flex-col gap-2 text-sm">
					{#if s.phone}
						<a href={`tel:${s.phone}`} class="flex items-center gap-2 hover:text-primary">
							<Phone class="size-4 text-muted-foreground" />{s.phone}
						</a>
					{/if}
					{#if s.email}
						<a href={`mailto:${s.email}`} class="flex items-center gap-2 hover:text-primary">
							<Mail class="size-4 text-muted-foreground" />{s.email}
						</a>
					{/if}
					{#if !s.phone && !s.email}
						<p class="text-muted-foreground">No contact details were given.</p>
					{/if}
				</div>
			</Card.Root>

			<!-- Beneficiary link — the continuity-of-care step. -->
			<Card.Root class="p-5">
				<h2 class="mb-3 font-heading text-base font-semibold">Beneficiary</h2>
				{#if data.beneficiary}
					<a
						href={`/dashboard/beneficiaries/${data.beneficiary.id}`}
						class="flex items-center gap-2 text-sm hover:text-primary"
					>
						<UserRound class="size-4 text-muted-foreground" />
						{data.beneficiary.fullName}
					</a>
					<p class="mt-2 text-xs text-muted-foreground">
						Linked, so a future application from this person is recognised.
					</p>
				{:else}
					<p class="mb-3 text-sm text-muted-foreground">
						{#if data.subject}
							Creates or finds the record for
							<strong>{data.subject.fullName ?? 'the person named above'}</strong>, the person being
							helped, not whoever filled the form in. Matches on phone number, then on name and date
							of birth.
						{:else}
							Not yet linked to a person. Linking matches on phone number and creates a record if
							this is someone new.
						{/if}
					</p>
					<form method="post" action="?/linkBeneficiary" use:enhance>
						<Button type="submit" size="sm" variant={acceptable ? 'default' : 'outline'}>
							<Link2 class="size-4" />
							{acceptable ? 'Accept and add as beneficiary' : 'Link to a beneficiary'}
						</Button>
					</form>
					{#if !acceptable}
						<p class="mt-2 text-xs text-muted-foreground">
							You can link at any point; it is not gated on the status. The button changes wording
							once the case reaches an approved stage.
						</p>
					{/if}
				{/if}
			</Card.Root>

			<!-- Disbursements -->
			{#if data.disbursements.length}
				<Card.Root class="p-5">
					<h2 class="mb-3 font-heading text-base font-semibold">Disbursed on this case</h2>
					<div class="flex flex-col gap-2 text-sm">
						{#each data.disbursements as row (row.id)}
							<div class="flex items-center justify-between gap-2 border-b pb-2 last:border-0">
								<div>
									<p class="font-medium">{formatMoney(row.amount, row.currency)}</p>
									<p class="text-xs text-muted-foreground">{row.paidTo} · {row.date}</p>
								</div>
								<Badge variant="outline" class="capitalize">
									{row.fundSource.replace('_', ' ')}
								</Badge>
							</div>
						{/each}
					</div>
				</Card.Root>
			{/if}
		</div>
	</div>
</div>
