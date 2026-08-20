<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import FilterBar from '$lib/dashboard/filter-bar.svelte';
	import StatusBadge from '$lib/dashboard/status-badge.svelte';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import {
		Archive,
		Ban,
		Clock,
		Mail,
		MailOpen,
		MessageSquareReply,
		Phone,
		UserRound
	} from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.ok) toast.success('Saved');
	});

	let search = $state(data.filters.search);

	const hasFilters = $derived(
		Boolean(
			data.filters.search ||
			data.filters.statusId ||
			data.filters.subjectId ||
			data.filters.unread ||
			data.filters.unanswered ||
			data.filters.mine ||
			data.filters.spam
		)
	);

	const unansweredCount = $derived(data.rows.filter((row) => !row.firstRespondedAt).length);

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

	/**
	 * Overdue against the promise the topic itself makes. A topic with no
	 * `targetResponseHours` promises nothing, so nothing on it is ever late.
	 */
	const isOverdue = (row: (typeof data.rows)[number]) => {
		if (row.firstRespondedAt || !row.targetResponseHours) return false;
		const due = new Date(row.createdAt).getTime() + row.targetResponseHours * 3600_000;
		return Date.now() > due;
	};

	const SOURCE_LABELS: Record<string, string> = {
		web_form: 'Contact form',
		email: 'Email',
		phone: 'Phone',
		walk_in: 'Walk-in',
		social: 'Social',
		other: 'Other'
	};
</script>

<svelte:head><title>Messages · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="font-heading text-2xl font-bold">Messages</h1>
		<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
			General enquiries from the contact form, and anything staff log from a call or a visit.
			Requests for assistance are on the applications board instead.
		</p>
	</div>

	<FilterBar bind:search placeholder="Name, reference, email or message…" {hasFilters}>
		{#snippet children({ applyFilter })}
			{#each data.statuses as status (status.id)}
				<Button
					variant={data.filters.statusId === String(status.id) ? 'default' : 'outline'}
					size="sm"
					onclick={() =>
						applyFilter(
							'status',
							data.filters.statusId === String(status.id) ? null : String(status.id)
						)}
				>
					{status.label}
				</Button>
			{/each}

			<Button
				variant={data.filters.unanswered ? 'default' : 'outline'}
				size="sm"
				onclick={() => applyFilter('unanswered', data.filters.unanswered ? null : '1')}
			>
				<MessageSquareReply class="size-4" /> Unanswered ({unansweredCount})
			</Button>

			<Button
				variant={data.filters.unread ? 'default' : 'outline'}
				size="sm"
				onclick={() => applyFilter('unread', data.filters.unread ? null : '1')}
			>
				<Mail class="size-4" /> Unread
			</Button>

			<Button
				variant={data.filters.mine ? 'default' : 'outline'}
				size="sm"
				onclick={() => applyFilter('mine', data.filters.mine ? null : '1')}
			>
				<UserRound class="size-4" /> Assigned to me
			</Button>

			{#each data.subjects as subject (subject.id)}
				<Button
					variant={data.filters.subjectId === String(subject.id) ? 'default' : 'outline'}
					size="sm"
					onclick={() =>
						applyFilter(
							'subject',
							data.filters.subjectId === String(subject.id) ? null : String(subject.id)
						)}
				>
					{subject.name}
				</Button>
			{/each}

			<Button
				variant={data.filters.spam ? 'destructive' : 'outline'}
				size="sm"
				onclick={() => applyFilter('spam', data.filters.spam ? null : '1')}
			>
				<Ban class="size-4" /> Spam
			</Button>
		{/snippet}
	</FilterBar>

	<div class="flex flex-col gap-3">
		{#each data.rows as row (row.id)}
			<Card.Root class={cn('p-5', !row.isRead && 'border-primary/40')}>
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<a href="/dashboard/messages/{row.id}" class="font-medium hover:underline">
								{row.fullName}
							</a>
							{#if row.organization}
								<span class="text-sm text-muted-foreground">· {row.organization}</span>
							{/if}
							{#if row.subjectName}
								<Badge variant="secondary">
									{#if row.subjectIcon}
										<DynamicIcon name={row.subjectIcon} class="size-3" />
									{/if}
									{row.subjectName}
								</Badge>
							{/if}
							<StatusBadge label={row.statusLabel} color={row.statusColor} />
							{#if !row.isRead}
								<Badge>New</Badge>
							{/if}
							{#if isOverdue(row)}
								<Badge variant="destructive">
									<Clock class="size-3" /> Overdue
								</Badge>
							{/if}
							{#if row.replyCount > 0}
								<Badge variant="outline">
									{row.replyCount}
									{row.replyCount === 1 ? 'reply' : 'replies'}
								</Badge>
							{/if}
						</div>

						<p class="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
							<span class="font-mono">{row.reference}</span>
							{#if row.email}
								<a
									href={`mailto:${row.email}`}
									class="flex items-center gap-1 hover:text-foreground"
								>
									<Mail class="size-3" />{row.email}
								</a>
							{/if}
							{#if row.phone}
								<a href={`tel:${row.phone}`} class="flex items-center gap-1 hover:text-foreground">
									<Phone class="size-3" />{row.phone}
								</a>
							{/if}
							<span>{fmt(row.createdAt)}</span>
							{#if row.source !== 'web_form'}
								<span>· {SOURCE_LABELS[row.source]}</span>
							{/if}
							{#if row.assigneeName}
								<span>· {row.assigneeName}</span>
							{/if}
						</p>
					</div>

					<div class="flex gap-1">
						<form method="post" action="?/markRead" use:enhance>
							<input type="hidden" name="id" value={row.id} />
							<input type="hidden" name="read" value={String(!row.isRead)} />
							<Button
								type="submit"
								variant="ghost"
								size="icon"
								title={row.isRead ? 'Mark unread' : 'Mark read'}
							>
								{#if row.isRead}
									<MailOpen class="size-4" />
								{:else}
									<Mail class="size-4" />
								{/if}
							</Button>
						</form>
						<form method="post" action="?/markSpam" use:enhance>
							<input type="hidden" name="id" value={row.id} />
							<input type="hidden" name="spam" value={String(!row.isSpam)} />
							<Button
								type="submit"
								variant="ghost"
								size="icon"
								title={row.isSpam ? 'Not spam' : 'Mark as spam'}
							>
								<Ban class="size-4" />
							</Button>
						</form>
						<form method="post" action="?/archive" use:enhance>
							<input type="hidden" name="id" value={row.id} />
							<Button type="submit" variant="ghost" size="icon" title="Archive">
								<Archive class="size-4" />
							</Button>
						</form>
					</div>
				</div>

				<p class="mt-3 line-clamp-3 text-sm whitespace-pre-wrap">{row.message}</p>

				<div class="mt-3">
					<a
						href="/dashboard/messages/{row.id}"
						class={buttonVariants({ variant: 'outline', size: 'sm' })}
					>
						<MessageSquareReply class="size-4" />
						{row.firstRespondedAt ? 'Open thread' : 'Read and reply'}
					</a>
				</div>
			</Card.Root>
		{:else}
			<Card.Root class="p-10 text-center">
				<p class="text-muted-foreground">
					{hasFilters ? 'No messages match those filters.' : 'No messages yet.'}
				</p>
			</Card.Root>
		{/each}
	</div>
</div>
