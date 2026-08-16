<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Archive, Mail, MailOpen, Phone } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.ok) toast.success('Saved');
	});

	const answer = (row: (typeof data.rows)[number], key: string) => {
		const value = (row.data ?? {})[key];
		return typeof value === 'string' ? value : '';
	};

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

<svelte:head><title>Messages · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="font-heading text-2xl font-bold">Messages</h1>
		<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
			General enquiries from the contact form. Requests for assistance are on the applications board
			instead.
		</p>
	</div>

	<div class="flex flex-col gap-3">
		{#each data.rows as row (row.id)}
			<Card.Root class={cn('p-5', !row.isRead && 'border-primary/40')}>
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-medium">{row.name || 'Anonymous'}</span>
							{#if answer(row, 'subject')}
								<Badge variant="secondary" class="capitalize">{answer(row, 'subject')}</Badge>
							{/if}
							{#if !row.isRead}
								<Badge>New</Badge>
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
						<form method="post" action="?/archive" use:enhance>
							<input type="hidden" name="id" value={row.id} />
							<Button type="submit" variant="ghost" size="icon" title="Archive">
								<Archive class="size-4" />
							</Button>
						</form>
					</div>
				</div>

				<p class="mt-3 text-sm whitespace-pre-wrap">
					{answer(row, 'message')}
				</p>
			</Card.Root>
		{:else}
			<Card.Root class="p-10 text-center">
				<p class="text-muted-foreground">No messages yet.</p>
			</Card.Root>
		{/each}
	</div>
</div>
