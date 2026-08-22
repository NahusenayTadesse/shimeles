<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import StatusBadge from '$lib/dashboard/status-badge.svelte';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import {
		ArrowLeft,
		Clock,
		Lock,
		Mail,
		Phone,
		Send,
		StickyNote,
		TriangleAlert
	} from '@lucide/svelte';
	import { cn } from '$lib/utils';
	import { formatDateTime } from '$lib/dates';

	let { data, form } = $props();

	const m = $derived(data.message);

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.ok) toast.success(form.message ?? 'Saved');
	});

	let statusId = $state('');
	let assignedToId = $state('');
	let subjectId = $state('');
	let priority = $state('');

	$effect(() => {
		statusId = m.statusId ? String(m.statusId) : '';
		assignedToId = m.assignedToId ?? '';
		subjectId = m.subjectId ? String(m.subjectId) : '';
		priority = m.priority;
	});

	/** Which of the two buttons under the box the staff member is about to press. */
	let channel = $state('email');

	const statusItems = $derived(
		data.statuses.map((status) => ({ value: String(status.id), name: status.label }))
	);

	const staffItems = $derived([
		{ value: '', name: 'Unassigned' },
		...data.staff.map((row) => ({ value: row.id, name: row.name }))
	]);

	const subjectItems = $derived([
		{ value: '', name: 'No topic' },
		...data.subjects.map((row) => ({ value: String(row.id), name: row.name }))
	]);

	const priorityItems = [
		{ value: 'low', name: 'Low' },
		{ value: 'normal', name: 'Normal' },
		{ value: 'high', name: 'High' },
		{ value: 'urgent', name: 'Urgent' }
	];

	const channelItems = [
		{ value: 'email', name: 'Email' },
		{ value: 'phone', name: 'Phone call' },
		{ value: 'sms', name: 'SMS' },
		{ value: 'in_person', name: 'In person' },
		{ value: 'note', name: 'No contact' }
	];

	const fmt = (value: Date | string | null) => formatDateTime(value, '');

	const CHANNEL_LABELS: Record<string, string> = {
		email: 'by email',
		phone: 'by phone',
		sms: 'by SMS',
		in_person: 'in person',
		note: 'no contact'
	};

	const SOURCE_LABELS: Record<string, string> = {
		web_form: 'the contact form',
		email: 'email',
		phone: 'a phone call',
		walk_in: 'a visit',
		social: 'social media',
		other: 'elsewhere'
	};

	const overdue = $derived.by(() => {
		if (m.firstRespondedAt || !m.targetResponseHours) return false;
		return Date.now() > new Date(m.createdAt).getTime() + m.targetResponseHours * 3600_000;
	});

	/** An email reply needs somewhere to send it. */
	const canEmail = $derived(Boolean(m.email));
</script>

<svelte:head><title>{m.fullName} · Messages</title></svelte:head>

<div class="flex flex-col gap-4">
	<a
		href="/dashboard/messages"
		class={buttonVariants({ variant: 'ghost', size: 'sm', class: 'w-fit' })}
	>
		<ArrowLeft class="size-4" /> Back to messages
	</a>

	<div class="flex flex-col gap-2">
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-mono text-sm text-muted-foreground">{m.reference}</span>
			<StatusBadge label={m.statusLabel} color={m.statusColor} />
			{#if m.subjectName}
				<Badge variant="secondary">{m.subjectName}</Badge>
			{:else if m.subjectOther}
				<Badge variant="outline">{m.subjectOther}</Badge>
			{/if}
			{#if m.priority !== 'normal'}
				<Badge variant={m.priority === 'low' ? 'outline' : 'destructive'} class="capitalize">
					{m.priority}
				</Badge>
			{/if}
			{#if overdue}
				<Badge variant="destructive"><Clock class="size-3" /> Overdue</Badge>
			{/if}
			{#if m.isSpam}
				<Badge variant="destructive">Spam</Badge>
			{/if}
		</div>
		<h1 class="font-heading text-2xl font-bold">
			{m.fullName}{m.organization ? ` · ${m.organization}` : ''}
		</h1>
		<p class="text-sm text-muted-foreground">
			Arrived via {SOURCE_LABELS[m.source]} on {fmt(m.createdAt)}{m.regionName
				? ` · ${m.regionName}`
				: ''}
		</p>
	</div>

	<div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
		<div class="flex flex-col gap-4">
			<!-- The thread, oldest first: their message, then everything since. -->
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">Conversation</h2>

				<div class="rounded-lg border bg-muted/30 p-4">
					<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
						<span class="text-sm font-medium">{m.fullName}</span>
						<span class="text-xs text-muted-foreground">{fmt(m.createdAt)}</span>
					</div>
					<p class="text-sm whitespace-pre-wrap">{m.message}</p>
				</div>

				{#each data.replies as reply (reply.id)}
					<div
						class={cn(
							'mt-3 rounded-lg border p-4',
							reply.isInternal ? 'border-dashed bg-muted/20' : 'border-primary/30 bg-primary/5'
						)}
					>
						<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
							<span class="flex items-center gap-2 text-sm font-medium">
								{#if reply.isInternal}
									<Lock class="size-3.5 text-muted-foreground" />
								{/if}
								{reply.authorName ?? 'The system'}
								<span class="font-normal text-muted-foreground">
									{reply.isInternal
										? 'left an internal note'
										: `replied ${CHANNEL_LABELS[reply.channel]}`}
								</span>
							</span>
							<span class="text-xs text-muted-foreground">{fmt(reply.createdAt)}</span>
						</div>
						<p class="text-sm whitespace-pre-wrap">{reply.body}</p>

						{#if !reply.isInternal && reply.channel === 'email' && !reply.sentAt}
							<p class="mt-2 flex items-center gap-1 text-xs text-destructive">
								<TriangleAlert class="size-3.5" />
								This was saved but the email did not send.
							</p>
						{/if}
					</div>
				{/each}
			</Card.Root>

			<!-- Compose. Two separate submit buttons rather than a toggle, so
			     "send to them" and "note to ourselves" can never be confused. -->
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">Respond</h2>

				<form
					method="post"
					action="?/reply"
					use:enhance={() =>
						async ({ update }) =>
							await update({ reset: true })}
					class="flex flex-col gap-3"
				>
					<Textarea
						name="body"
						rows={5}
						placeholder="Write your reply, or a note for colleagues…"
					/>

					<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
						<div class="flex flex-col gap-1">
							<span class="text-xs text-muted-foreground">How did you respond?</span>
							<div class="w-44">
								<SelectComp name="channel" items={channelItems} bind:value={channel} />
							</div>
						</div>

						<div class="flex flex-wrap gap-2">
							<Button
								type="submit"
								name="isInternal"
								value="true"
								variant="outline"
								title="Only staff will see this"
							>
								<StickyNote class="size-4" /> Save internal note
							</Button>
							<Button
								type="submit"
								name="isInternal"
								value="false"
								disabled={channel === 'email' && !canEmail}
								title={channel === 'email' && !canEmail
									? 'This sender left no email address'
									: 'The sender will see this'}
							>
								<Send class="size-4" />
								{channel === 'email' ? 'Send reply' : 'Log reply'}
							</Button>
						</div>
					</div>

					<p class="text-xs text-muted-foreground">
						{#if channel === 'email'}
							{canEmail
								? `Sending emails ${m.email} and records the reply here.`
								: 'This sender left no email address — record how you reached them instead.'}
						{:else}
							Recorded as a reply that happened {CHANNEL_LABELS[channel]}; nothing is emailed.
						{/if}
					</p>
				</form>
			</Card.Root>
		</div>

		<div class="flex flex-col gap-4">
			<Card.Root class="p-5">
				<h2 class="mb-3 font-heading text-base font-semibold">Contact</h2>
				<div class="flex flex-col gap-2 text-sm">
					{#if m.email}
						<a href={`mailto:${m.email}`} class="flex items-center gap-2 hover:text-primary">
							<Mail class="size-4 text-muted-foreground" />{m.email}
						</a>
					{/if}
					{#if m.phone}
						<a href={`tel:${m.phone}`} class="flex items-center gap-2 hover:text-primary">
							<Phone class="size-4 text-muted-foreground" />{m.phone}
						</a>
					{/if}
					<p class="text-xs text-muted-foreground">
						Would rather be reached {m.preferredChannel === 'either'
							? 'either way'
							: `by ${m.preferredChannel}`}.
					</p>
					{#if m.joinNewsletter}
						<p class="text-xs text-muted-foreground">Opted in to the newsletter.</p>
					{/if}
				</div>
			</Card.Root>

			<Card.Root class="p-5">
				<h2 class="mb-3 font-heading text-base font-semibold">Handling</h2>

				<form
					method="post"
					action="?/setStatus"
					use:enhance={() =>
						async ({ update }) =>
							await update({ reset: false })}
					class="mb-3 flex flex-col gap-2"
				>
					<span class="text-xs text-muted-foreground">Status</span>
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
					class="mb-3 flex flex-col gap-2"
				>
					<span class="text-xs text-muted-foreground">Assigned to</span>
					<SelectComp name="assignedToId" items={staffItems} bind:value={assignedToId} />
					<Button type="submit" size="sm" variant="outline">Assign</Button>
				</form>

				<Separator class="my-3" />

				<form
					method="post"
					action="?/setSubject"
					use:enhance={() =>
						async ({ update }) =>
							await update({ reset: false })}
					class="mb-3 flex flex-col gap-2"
				>
					<span class="text-xs text-muted-foreground">Topic</span>
					<SelectComp name="subjectId" items={subjectItems} bind:value={subjectId} />
					<Button type="submit" size="sm" variant="outline">Retag</Button>
				</form>

				<Separator class="my-3" />

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

			<Card.Root class="p-5">
				<h2 class="mb-3 font-heading text-base font-semibold">Timing</h2>
				<dl class="flex flex-col gap-2 text-sm">
					<div class="flex justify-between gap-2">
						<dt class="text-muted-foreground">Arrived</dt>
						<dd class="text-right">{fmt(m.createdAt)}</dd>
					</div>
					<div class="flex justify-between gap-2">
						<dt class="text-muted-foreground">First reply</dt>
						<dd class="text-right">
							{m.firstRespondedAt ? fmt(m.firstRespondedAt) : 'Not yet'}
						</dd>
					</div>
					{#if m.targetResponseHours}
						<div class="flex justify-between gap-2">
							<dt class="text-muted-foreground">Target</dt>
							<dd class="text-right">within {m.targetResponseHours}h</dd>
						</div>
					{/if}
					{#if m.closedAt}
						<div class="flex justify-between gap-2">
							<dt class="text-muted-foreground">Closed</dt>
							<dd class="text-right">{fmt(m.closedAt)}</dd>
						</div>
					{/if}
				</dl>
			</Card.Root>

			{#if m.data && Object.keys(m.data).length}
				<Card.Root class="p-5">
					<h2 class="mb-3 font-heading text-base font-semibold">Also submitted</h2>
					<dl class="flex flex-col gap-2 text-sm">
						{#each Object.entries(m.data) as [key, value] (key)}
							<div>
								<dt class="text-xs tracking-wide text-muted-foreground uppercase">
									{key.replace(/_/g, ' ')}
								</dt>
								<dd class="whitespace-pre-wrap">
									{Array.isArray(value) ? value.join(', ') : String(value)}
								</dd>
							</div>
						{/each}
					</dl>
				</Card.Root>
			{/if}
		</div>
	</div>
</div>
