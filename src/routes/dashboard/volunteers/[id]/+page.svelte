<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { ArrowLeft, Copy, Link2Off, Lock, Mail, Phone, RefreshCw, Send } from '@lucide/svelte';
	import StatusBadge from '$lib/dashboard/status-badge.svelte';
	import { VOLUNTEER_FORM_SECTIONS, LOCKED_SECTIONS } from '$lib/volunteer-form-parts';
	import { formatDate } from '$lib/dates';
	import { SvelteSet } from 'svelte/reactivity';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.sent) toast.success('The link is on its way');
		else if (form?.ok) toast.success('Saved');
	});

	/**
	 * The editor's working copy. Everything is shown by default, so the checkbox
	 * reads "include this" and the stored value is its opposite — a coordinator
	 * thinks in what to ask, and the database stores what to leave out so that a
	 * part added in a later release is asked rather than silently missing.
	 */
	const hidden = new SvelteSet<string>(data.invite.hiddenParts);
	let isActive = $state(data.invite.isActive);

	$effect(() => {
		// Resynced from the server's answer after a save, so the checkboxes show
		// what was actually stored rather than what was clicked.
		hidden.clear();
		for (const key of data.invite.hiddenParts) hidden.add(key);
		isActive = data.invite.isActive;
	});

	const toggle = (key: string) => {
		if (hidden.has(key)) hidden.delete(key);
		else hidden.add(key);
	};

	const shownCount = $derived(
		VOLUNTEER_FORM_SECTIONS.flatMap((section) => section.parts).filter(
			(part) => !hidden.has(part.key)
		).length
	);

	const totalCount = VOLUNTEER_FORM_SECTIONS.flatMap((section) => section.parts).length;

	const copyLink = async () => {
		await navigator.clipboard.writeText(data.invite.url);
		toast.success('Link copied');
	};

	const fmt = (value: Date | string | null) => formatDate(value, '');
</script>

<svelte:head><title>{data.application.fullName} · Volunteers</title></svelte:head>

<div class="flex flex-col gap-4">
	<a
		href="/dashboard/volunteers"
		class={buttonVariants({ variant: 'ghost', size: 'sm', class: 'w-fit' })}
	>
		<ArrowLeft class="size-4" /> Back to volunteers
	</a>

	<div class="flex flex-col gap-2">
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-mono text-sm text-muted-foreground">{data.application.reference}</span>
			<StatusBadge label={data.application.statusLabel} color={data.application.statusColor} />
		</div>
		<h1 class="font-heading text-2xl font-bold">{data.application.fullName}</h1>
		<p class="text-sm text-muted-foreground">
			Applied {fmt(data.application.createdAt)}{data.application.regionName
				? ` · ${data.application.regionName}`
				: ''}
		</p>
	</div>

	<!-- Read-only. The status, the safeguarding checklist, the licences and the
	     references are edited in the row on the volunteers table — this page is
	     for composing their form and sending it. -->
	<Card.Root class="p-6">
		<div class="mb-4 flex flex-wrap items-center gap-4 text-sm">
			{#if data.application.phone}
				<a
					href="tel:{data.application.phone}"
					class="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
				>
					<Phone class="size-4" />{data.application.phone}
				</a>
			{/if}
			{#if data.application.email}
				<a
					href="mailto:{data.application.email}"
					class="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
				>
					<Mail class="size-4" />{data.application.email}
				</a>
			{/if}
			{#if data.application.city}
				<span class="text-muted-foreground">{data.application.city}</span>
			{/if}
		</div>

		{#if data.interests.length}
			<div class="mb-3 flex flex-wrap gap-1.5">
				{#each data.interests as interest (interest)}
					<Badge variant="secondary">{interest}</Badge>
				{/each}
			</div>
		{/if}

		{#if data.application.motivation}
			<h2 class="mb-1 text-sm font-medium">Why they want to help</h2>
			<p class="text-sm whitespace-pre-line text-muted-foreground">
				{data.application.motivation}
			</p>
		{/if}

		{#if data.skills.length || data.availability.length}
			<div class="mt-4 grid gap-3 sm:grid-cols-2">
				{#if data.skills.length}
					<div>
						<h2 class="mb-1 text-sm font-medium">Skills</h2>
						<p class="text-sm text-muted-foreground">{data.skills.join(', ')}</p>
					</div>
				{/if}
				{#if data.availability.length}
					<div>
						<h2 class="mb-1 text-sm font-medium">Free</h2>
						<p class="text-sm text-muted-foreground">{data.availability.join(', ')}</p>
					</div>
				{/if}
			</div>
		{/if}
	</Card.Root>

	<div>
		<h2 class="font-heading text-lg font-semibold">Their form</h2>
		<p class="max-w-prose text-sm text-muted-foreground">
			{data.application.fullName} gave us five answers when they applied. This is the rest of the application,
			and the link that lets them fill it in themselves. Choose what to ask, then send the link — or copy
			it and send it however you already talk to them.
		</p>
	</div>

	<div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
		<!-- The form editor -->
		<form method="post" action="?/save" use:enhance class="flex flex-col gap-4">
			<input type="hidden" name="isActive" value={String(isActive)} />
			{#each [...hidden] as key (key)}
				<input type="hidden" name="hidden" value={key} />
			{/each}

			<Card.Root class="p-6">
				<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
					<div>
						<h2 class="font-heading text-lg font-semibold">What to ask</h2>
						<p class="text-sm text-muted-foreground">
							Everything is asked unless you switch it off.
						</p>
					</div>
					<Badge variant="secondary">{shownCount} of {totalCount} included</Badge>
				</div>

				<div class="flex flex-col gap-6">
					{#each VOLUNTEER_FORM_SECTIONS as section (section.key)}
						<div>
							<div class="mb-2">
								<h3 class="font-medium">{section.label}</h3>
								<p class="text-sm text-muted-foreground">{section.description}</p>
							</div>

							<div class="flex flex-col gap-2">
								{#each section.parts as part (part.key)}
									{@const shown = !hidden.has(part.key)}
									<label
										class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition {shown
											? 'border-primary/50 bg-primary/5'
											: 'border-border opacity-70'}"
									>
										<Checkbox
											checked={shown}
											onCheckedChange={() => toggle(part.key)}
											class="mt-0.5"
										/>
										<span class="min-w-0">
											<span class="block text-sm font-medium">{part.label}</span>
											{#if part.hint}
												<span class="mt-0.5 block text-xs text-muted-foreground">{part.hint}</span>
											{/if}
										</span>
									</label>
								{/each}
							</div>
						</div>
					{/each}

					<!-- Not toggles. A coordinator can see the whole form, including
					     the parts that are not theirs to switch off. -->
					<div>
						<div class="mb-2 flex items-center gap-2">
							<Lock class="size-4 text-muted-foreground" />
							<h3 class="font-medium">Always asked</h3>
						</div>
						<div class="flex flex-col gap-2">
							{#each LOCKED_SECTIONS as locked (locked.label)}
								<div class="rounded-lg border border-dashed p-3">
									<p class="text-sm font-medium">{locked.label}</p>
									<p class="mt-0.5 text-xs text-muted-foreground">{locked.reason}</p>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</Card.Root>

			<div class="flex justify-end">
				<Button type="submit">Save the form</Button>
			</div>
		</form>

		<!-- The link itself -->
		<div class="flex flex-col gap-4">
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">The link</h2>

				<label class="flex items-start gap-3 rounded-lg border p-3">
					<Switch checked={isActive} onCheckedChange={(value) => (isActive = value)} />
					<span class="min-w-0">
						<span class="block text-sm font-medium">
							{isActive ? 'Open' : 'Closed'}
						</span>
						<span class="mt-0.5 block text-xs text-muted-foreground">
							{isActive
								? 'The link opens the form.'
								: 'The link shows a "not found" page. Nobody can tell it ever worked.'}
						</span>
					</span>
				</label>
				<p class="mt-2 text-xs text-muted-foreground">
					Switching this takes effect when you save the form.
				</p>

				<div class="mt-4 flex flex-col gap-2">
					<Input value={data.invite.url} readonly class="font-mono text-xs" />
					<Button type="button" variant="outline" onclick={copyLink}>
						<Copy class="size-4" /> Copy the link
					</Button>
				</div>

				<div class="mt-4 flex flex-col gap-2">
					<form method="post" action="?/send" use:enhance>
						<Button type="submit" class="w-full" disabled={!data.application.email || !isActive}>
							<Send class="size-4" />
							Email it to them
						</Button>
					</form>

					{#if data.application.email}
						<p class="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Mail class="size-3" />
							{data.application.email}
						</p>
					{:else}
						<p class="text-xs text-muted-foreground">
							No email address on this application. Copy the link and send it another way.
						</p>
					{/if}
				</div>
			</Card.Root>

			<Card.Root class="p-6">
				<h2 class="mb-3 font-heading text-lg font-semibold">Where it stands</h2>
				<dl class="flex flex-col gap-2 text-sm">
					<div class="flex items-center justify-between gap-2">
						<dt class="text-muted-foreground">Emailed</dt>
						<dd>{data.invite.sentAt ? fmt(data.invite.sentAt) : 'Not yet'}</dd>
					</div>
					<div class="flex items-center justify-between gap-2">
						<dt class="text-muted-foreground">Filled in</dt>
						<dd>
							{#if data.invite.completedAt}
								<Badge variant="outline">{fmt(data.invite.completedAt)}</Badge>
							{:else}
								Not yet
							{/if}
						</dd>
					</div>
				</dl>

				<Alert.Root class="mt-4">
					<Link2Off class="size-4" />
					<Alert.Title>Sent it to the wrong person?</Alert.Title>
					<Alert.Description>
						A new link makes the old one meaningless. Switching the link off only closes it — the
						address still works again the moment you switch it back on.
					</Alert.Description>
				</Alert.Root>

				<form method="post" action="?/regenerate" use:enhance class="mt-3">
					<Button type="submit" variant="outline" size="sm" class="w-full">
						<RefreshCw class="size-4" /> Make a new link
					</Button>
				</form>
			</Card.Root>

			<Card.Root class="p-6">
				<h2 class="mb-2 font-heading text-lg font-semibold">Or fill it in yourself</h2>
				<p class="mb-3 text-sm text-muted-foreground">
					For a volunteer who would rather talk than type. Nothing on that screen is required, so
					you can enter what you have and come back to the rest.
				</p>
				<a
					href="/dashboard/volunteers/{data.application.id}/details"
					class={buttonVariants({ variant: 'outline', size: 'sm', class: 'w-full' })}
				>
					Fill in their details
				</a>
			</Card.Root>
		</div>
	</div>
</div>
