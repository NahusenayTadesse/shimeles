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

			<!-- The application itself -->
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">Their application</h2>
				<dl class="grid gap-4 sm:grid-cols-2">
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">Availability</dt>
						<dd class="mt-1 text-sm whitespace-pre-wrap">{a.availability ?? '—'}</dd>
					</div>
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">Skills</dt>
						<dd class="mt-1 text-sm whitespace-pre-wrap">{(a.skills ?? []).join(', ') || '—'}</dd>
					</div>
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">Interests</dt>
						<dd class="mt-1 flex flex-wrap gap-1">
							{#each a.areasOfInterest ?? [] as interest (interest)}
								<Badge variant="secondary">
									{data.pillarOptions.find((p) => p.id === interest)?.name ?? interest}
								</Badge>
							{:else}
								<span class="text-sm">—</span>
							{/each}
						</dd>
					</div>
					{#if a.professionalCredentials}
						<div class="sm:col-span-2">
							<dt class="text-xs tracking-wide text-muted-foreground uppercase">
								Professional credentials
							</dt>
							<dd class="mt-1 text-sm whitespace-pre-wrap">{a.professionalCredentials}</dd>
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

				<form
					method="post"
					action="?/setReferencesChecked"
					use:enhance={() =>
						async ({ update }) =>
							await update({ reset: false })}
					class="mb-3"
				>
					<input type="hidden" name="checked" value={String(!a.referencesChecked)} />
					<Button
						type="submit"
						size="sm"
						variant={a.referencesChecked ? 'outline' : 'default'}
						class="w-full"
					>
						{#if a.referencesChecked}
							<ShieldCheck class="size-4" /> References checked
						{:else}
							Mark references checked
						{/if}
					</Button>
				</form>

				{#if data.isProfessional}
					<form
						method="post"
						action="?/verifyCredentials"
						use:enhance={() =>
							async ({ update }) =>
								await update({ reset: false })}
					>
						<input type="hidden" name="verified" value={String(!a.credentialsVerified)} />
						<Button
							type="submit"
							size="sm"
							variant={a.credentialsVerified ? 'outline' : 'default'}
							class="w-full"
						>
							{#if a.credentialsVerified}
								<ShieldCheck class="size-4" /> Credentials verified
							{:else}
								Mark credentials verified
							{/if}
						</Button>
					</form>
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
