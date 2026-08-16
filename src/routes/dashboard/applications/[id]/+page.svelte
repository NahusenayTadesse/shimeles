<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import StatusBadge from '$lib/dashboard/status-badge.svelte';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import { assetUrl } from '$lib/assets';
	import { formatMoney } from '$lib/money';
	import {
		ArrowLeft,
		FileText,
		Image as ImageIcon,
		Link2,
		Mail,
		MessageSquarePlus,
		Phone,
		ShieldCheck,
		UserRound
	} from '@lucide/svelte';

	let { data, form } = $props();

	const s = $derived(data.submission);

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.ok) toast.success('Saved');
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
	const priorityItems = [
		{ value: 'low', name: 'Low' },
		{ value: 'normal', name: 'Normal' },
		{ value: 'high', name: 'High' },
		{ value: 'urgent', name: 'Urgent' }
	];

	/**
	 * Renders one stored answer using the field definition that produced it, so
	 * a select shows "Help with treatment costs" rather than `treatment_cost`.
	 */
	function display(field: (typeof data.fields)[number]): string {
		const value = (s.data ?? {})[field.fieldKey];
		if (value == null || value === '') return '—';

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

	const fmt = (value: Date | string | null) =>
		value
			? new Intl.DateTimeFormat('en-GB', {
					day: 'numeric',
					month: 'short',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				}).format(new Date(value))
			: '';
</script>

<svelte:head><title>{s.reference} · Dashboard</title></svelte:head>

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
					<Badge variant={s.priority === 'low' ? 'outline' : 'destructive'} class="capitalize">
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

			<!-- Case notes -->
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">Case notes</h2>

				<form
					method="post"
					action="?/addNote"
					use:enhance={() =>
						async ({ update }) =>
							await update({ reset: true })}
					class="mb-5 flex flex-col gap-2"
				>
					<Textarea name="note" rows={3} placeholder="Add an internal note…" required />
					<Button type="submit" size="sm" class="w-fit">
						<MessageSquarePlus class="size-4" /> Add note
					</Button>
				</form>

				<div class="flex flex-col gap-3">
					{#each data.notes as note (note.id)}
						<div
							class="rounded-lg border p-3 text-sm {note.isSystem
								? 'bg-muted/40 text-muted-foreground'
								: ''}"
						>
							<p class="whitespace-pre-wrap">{note.note}</p>
							<p class="mt-2 text-xs text-muted-foreground">
								{note.authorName ?? 'System'} · {fmt(note.createdAt)}
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

				<form
					method="post"
					action="?/setStatus"
					use:enhance={() =>
						async ({ update }) =>
							await update({ reset: false })}
					class="mb-4 flex flex-col gap-2"
				>
					<SelectComp name="statusId" items={statusItems} bind:value={statusId} />
					<Textarea name="note" rows={2} placeholder="Why? (optional, saved as a case note)" />
					<Button type="submit" size="sm">Update status</Button>
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
						Not yet linked to a person. Linking matches on phone number and creates a record if this
						is someone new.
					</p>
					<form method="post" action="?/linkBeneficiary" use:enhance>
						<Button type="submit" size="sm" variant="outline">
							<Link2 class="size-4" /> Link to a beneficiary
						</Button>
					</form>
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
