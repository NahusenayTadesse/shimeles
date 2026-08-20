<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import StatusBadge from '$lib/dashboard/status-badge.svelte';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import { assetUrl } from '$lib/assets';
	import { formatMoney } from '$lib/money';
	import {
		AGE_GROUP_LABELS,
		CONDITION_LABELS,
		CONTACT_CHANNEL_LABELS,
		GENDER_LABELS,
		IN_KIND_STATUS_COLORS,
		IN_KIND_STATUS_LABELS,
		LOAD_SIZE_LABELS,
		VALUATION_LABELS
	} from '$lib/inKind';
	import {
		ArrowLeft,
		Ban,
		CalendarClock,
		CheckCircle2,
		Mail,
		MapPin,
		Package,
		PackageCheck,
		PackageOpen,
		Phone,
		RotateCcw,
		Snowflake,
		Truck,
		TriangleAlert,
		Undo2
	} from '@lucide/svelte';

	let { data, form } = $props();

	const o = $derived(data.offer);

	$effect(() => {
		if (form?.error) {
			toast.error(form.error);
		} else if (form?.ok) {
			toast.success(form.emailed ? 'Saved — the donor has been told.' : 'Saved');
			if (form.notifyFailed) {
				toast.error('Saved, but the email did not go out. Please ring them instead.');
			}
			open = null;
		}
	});

	/** Which of the step dialogs is open, if any. */
	let open = $state<'decide' | 'decline' | 'schedule' | 'receive' | 'distribute' | 'cancel' | null>(
		null
	);

	const HANDOVER_LABELS: Record<string, string> = {
		dropoff: 'The donor will bring it in',
		pickup: 'We collect it',
		courier: 'Coming by courier',
		already_shipped: 'Already shipped'
	};

	const DONOR_TYPE_LABELS: Record<string, string> = {
		individual: 'Individual',
		family: 'Family',
		business: 'Business',
		school: 'School or university',
		faith_group: 'Church or mosque',
		association: 'Association or idir',
		ngo: 'Organisation',
		government: 'Government office',
		other: 'Other'
	};

	const fmt = (value: Date | string | null) =>
		value
			? new Intl.DateTimeFormat('en-GB', {
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				}).format(new Date(value))
			: '—';

	const fmtDay = (value: string | null) =>
		value
			? new Intl.DateTimeFormat('en-GB', {
					weekday: 'long',
					day: 'numeric',
					month: 'long'
				}).format(new Date(value))
			: '—';

	const today = new Date().toISOString().slice(0, 10);

	const donorLabel = $derived(o.organisationName ?? o.donorName);

	const staffItems = $derived([
		{ value: '', name: 'Nobody yet' },
		...data.staff.map((row) => ({ value: row.id, name: row.name }))
	]);

	/** Writable derived: follows the row, and the Select may still write to it. */
	let assignedToId = $derived(o.assignedToId ?? '');

	/** Lines the donor's own category is no longer accepting — worth knowing before saying yes. */
	/** Pure: builds a new date rather than mutating one, which the linter and
	    the next reader both prefer. */
	const addDays = (iso: string, days: number) =>
		new Date(new Date(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10);

	const pausedLines = $derived(data.items.filter((item) => item.categoryAcceptingNow === false));

	/** Use-by dates that have already passed, or are about to. */
	const expiringLines = $derived(
		data.items.filter((item) => item.expiresOn && item.expiresOn <= addDays(today, 30))
	);

	const overdue = $derived(
		o.status === 'scheduled' && Boolean(o.scheduledFor) && o.scheduledFor! < today
	);

	const receivedTotal = $derived(
		data.items.reduce((total, item) => total + (item.acceptedQuantity ?? 0), 0)
	);
</script>

<svelte:head><title>{o.reference} · Gifts in kind</title></svelte:head>

<div class="flex flex-col gap-4">
	<a
		href="/dashboard/in-kind"
		class={buttonVariants({ variant: 'ghost', size: 'sm', class: 'w-fit' })}
	>
		<ArrowLeft class="size-4" /> Back to gifts in kind
	</a>

	<div class="flex flex-col gap-2">
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-mono text-sm text-muted-foreground">{o.reference}</span>
			<StatusBadge
				label={IN_KIND_STATUS_LABELS[o.status]}
				color={IN_KIND_STATUS_COLORS[o.status]}
			/>
			{#if o.isPerishable}<Badge variant="secondary">Perishable</Badge>{/if}
			{#if o.needsColdStorage}
				<Badge variant="secondary" class="gap-1"><Snowflake class="size-3" /> Cold storage</Badge>
			{/if}
			{#if o.requiresVehicle}
				<Badge variant="outline" class="gap-1"><Truck class="size-3" /> Vehicle needed</Badge>
			{/if}
		</div>
		<h1 class="font-heading text-2xl font-bold">{o.summary}</h1>
		<p class="text-sm text-muted-foreground">
			Offered {fmt(o.createdAt)} by {o.isAnonymous
				? 'a donor who asked to stay anonymous'
				: donorLabel}
			· {o.itemCount}
			{o.itemCount === 1 ? 'line' : 'lines'} · {o.totalQuantity} items in total
		</p>
	</div>

	{#if o.hasRestrictedItems}
		<Alert.Root variant="destructive">
			<TriangleAlert class="size-4" />
			<Alert.Title>The donor flagged restricted items</Alert.Title>
			<Alert.Description>
				{o.restrictedItemsNote ?? 'No detail given — ask before accepting.'}
				<span class="mt-1 block">
					Medicine and powered equipment carry rules. Check before this is accepted, not after it is
					in the store room.
				</span>
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if overdue}
		<Alert.Root variant="destructive">
			<CalendarClock class="size-4" />
			<Alert.Title>This collection is overdue</Alert.Title>
			<Alert.Description>
				Booked for {fmtDay(o.scheduledFor)}. The donor is still holding on to it.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if expiringLines.length && o.status !== 'distributed'}
		<Alert.Root>
			<TriangleAlert class="size-4" />
			<Alert.Title>Something here has a use-by date</Alert.Title>
			<Alert.Description>
				{#each expiringLines as line (line.id)}
					<span class="block">{line.description} — use by {fmt(line.expiresOn)}</span>
				{/each}
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if pausedLines.length && (o.status === 'offered' || o.status === 'under_review')}
		<Alert.Root>
			<Ban class="size-4" />
			<Alert.Title>We are not taking some of this at the moment</Alert.Title>
			<Alert.Description>
				{#each pausedLines as line (line.id)}
					<span class="block">
						{line.description} — {line.categoryName} is paused on the gift categories screen.
					</span>
				{/each}
			</Alert.Description>
		</Alert.Root>
	{/if}

	<!-- ==================== What happens next ====================
	     One row of buttons, in the order the work is actually done. Only the
	     moves this offer can legally make are drawn; the server refuses the
	     rest regardless. -->
	<Card.Root class="flex flex-wrap items-center gap-2 p-4">
		{#if data.canMove.review && o.status === 'offered'}
			<form method="post" action="?/startReview" use:enhance>
				<Button type="submit" variant="outline" size="sm">
					<PackageOpen class="size-4" /> I am looking at this
				</Button>
			</form>
		{/if}

		{#if data.canMove.accept}
			<Button size="sm" onclick={() => (open = 'decide')}>
				<CheckCircle2 class="size-4" /> Accept
			</Button>
		{/if}

		{#if data.canMove.decline}
			<Button variant="outline" size="sm" onclick={() => (open = 'decline')}>
				<Ban class="size-4" /> Decline
			</Button>
		{/if}

		{#if data.canMove.schedule}
			<Button variant="outline" size="sm" onclick={() => (open = 'schedule')}>
				<CalendarClock class="size-4" />
				{o.scheduledFor ? 'Re-book the handover' : 'Book the handover'}
			</Button>
		{/if}

		{#if data.canMove.receive}
			<Button size="sm" onclick={() => (open = 'receive')}>
				<PackageCheck class="size-4" /> Count it in
			</Button>
		{/if}

		{#if data.canMove.distribute}
			<Button size="sm" onclick={() => (open = 'distribute')}>
				<Package class="size-4" /> Record where it went
			</Button>
		{/if}

		{#if data.canMove.cancel}
			<Button variant="ghost" size="sm" onclick={() => (open = 'cancel')}>Withdrawn</Button>
		{/if}

		{#if o.status === 'declined' || o.status === 'cancelled'}
			<form method="post" action="?/reopen" use:enhance>
				<Button type="submit" variant="outline" size="sm">
					<RotateCcw class="size-4" /> Re-open
				</Button>
			</form>
		{/if}

		{#if o.status === 'distributed'}
			<p class="text-sm text-muted-foreground">
				This gift is closed. It reached the people it was meant for on {fmt(o.updatedAt)}.
			</p>
		{/if}
	</Card.Root>

	<div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
		<div class="flex flex-col gap-4">
			<!-- ==================== The goods ==================== -->
			<Card.Root class="p-6">
				<div class="mb-4 flex items-center justify-between gap-2">
					<h2 class="font-heading text-lg font-semibold">What is being given</h2>
					{#if o.status === 'received' || o.status === 'distributed'}
						<Badge variant="outline">{receivedTotal} of {o.totalQuantity} taken in</Badge>
					{/if}
				</div>

				<div class="flex flex-col gap-3">
					{#each data.items as item (item.id)}
						<div class="rounded-lg border p-4">
							<div class="flex flex-wrap items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="font-medium">
										{item.quantity}
										{item.unit} — {item.description}
									</p>
									<p
										class="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
									>
										{#if item.categoryIcon}
											<DynamicIcon name={item.categoryIcon} class="size-3.5" />
										{/if}
										{item.categoryName ?? 'Uncategorised'}
										· {CONDITION_LABELS[item.condition]}
									</p>
								</div>
								{#if item.estimatedValue}
									<span class="text-sm text-muted-foreground">
										~{formatMoney(item.estimatedValue, item.currency)}
									</span>
								{/if}
							</div>

							<div class="mt-2 flex flex-wrap gap-1">
								{#if item.sizeRange}
									<Badge variant="secondary">Sizes {item.sizeRange}</Badge>
								{/if}
								{#if item.ageGroup !== 'any'}
									<Badge variant="outline">{AGE_GROUP_LABELS[item.ageGroup]}</Badge>
								{/if}
								{#if item.gender !== 'unisex'}
									<Badge variant="outline">{GENDER_LABELS[item.gender]}</Badge>
								{/if}
								{#if item.brandOrModel}
									<Badge variant="outline">{item.brandOrModel}</Badge>
								{/if}
								{#if item.expiresOn}
									<Badge variant={item.expiresOn <= today ? 'destructive' : 'secondary'}>
										Use by {fmt(item.expiresOn)}
									</Badge>
								{/if}
								{#if item.needsRefrigeration}
									<Badge variant="secondary" class="gap-1">
										<Snowflake class="size-3" /> Keep cold
									</Badge>
								{/if}
							</div>

							{#if item.notes}
								<p class="mt-2 text-sm text-muted-foreground">{item.notes}</p>
							{/if}

							{#if item.acceptedQuantity !== null}
								<p
									class="mt-2 border-t pt-2 text-sm {item.acceptedQuantity < item.quantity
										? 'text-warning'
										: 'text-success'}"
								>
									Took in {item.acceptedQuantity}
									{item.unit}{item.acceptedQuantity < item.quantity
										? ` of the ${item.quantity} offered`
										: ''}{item.intakeNote ? ` — ${item.intakeNote}` : ''}
								</p>
							{/if}

							{#if item.acceptanceNote && (o.status === 'offered' || o.status === 'under_review')}
								<p class="mt-2 text-xs text-muted-foreground">
									Our rule for {item.categoryName}: {item.acceptanceNote}
								</p>
							{/if}
						</div>
					{/each}
				</div>

				{#if o.estimatedValue}
					<p class="mt-4 text-xs text-muted-foreground">
						Estimated at {formatMoney(o.estimatedValue, o.currency)} — {VALUATION_LABELS[
							o.valuationBasis
						]}. This is the donor's own figure, kept for the annual report and their receipt. It is
						never counted as money raised.
					</p>
				{/if}
			</Card.Root>

			<!-- ==================== Photos ==================== -->
			{#if data.photos.length}
				<Card.Root class="p-6">
					<h2 class="mb-4 font-heading text-lg font-semibold">Photographs</h2>
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{#each data.photos as photo (photo.id)}
							<a
								href={assetUrl(photo.storagePath)}
								target="_blank"
								rel="noreferrer"
								class="group overflow-hidden rounded-lg border"
							>
								<img
									src={assetUrl(photo.storagePath)}
									alt={photo.caption ?? 'Photograph of the offered goods'}
									class="aspect-square w-full object-cover transition-transform group-hover:scale-105"
									loading="lazy"
								/>
							</a>
						{/each}
					</div>
					<p class="mt-3 text-xs text-muted-foreground">
						Private files — these are often taken inside someone's home, and only signed-in staff
						can open them.
					</p>
				</Card.Root>
			{/if}

			<!-- ==================== Handover ==================== -->
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">Getting hold of it</h2>

				<dl class="grid gap-3 sm:grid-cols-2">
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">Handover</dt>
						<dd class="text-sm">{HANDOVER_LABELS[o.handoverMethod] ?? o.handoverMethod}</dd>
					</div>
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">Size of the load</dt>
						<dd class="text-sm">
							{LOAD_SIZE_LABELS[o.loadSize]}{o.estimatedWeightKg
								? ` · about ${o.estimatedWeightKg} kg`
								: ''}
						</dd>
					</div>
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">Available</dt>
						<dd class="text-sm">
							{o.availableFrom ? fmt(o.availableFrom) : 'Any time'}{o.availableUntil
								? ` until ${fmt(o.availableUntil)}`
								: ''}
						</dd>
					</div>
					<div>
						<dt class="text-xs tracking-wide text-muted-foreground uppercase">Helping hands</dt>
						<dd class="text-sm">
							{o.requiresHelpLoading ? 'Needs help with lifting' : 'No lifting help asked for'}
						</dd>
					</div>
				</dl>

				{#if o.handoverMethod === 'pickup'}
					<Separator class="my-4" />
					<div class="flex flex-col gap-2 text-sm">
						<p class="flex items-start gap-2">
							<MapPin class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							<span>
								{o.pickupAddressLine ?? '—'}{o.pickupCity ? `, ${o.pickupCity}` : ''}
								{#if o.pickupLandmark}
									<span class="block text-muted-foreground">{o.pickupLandmark}</span>
								{/if}
								{#if o.regionName}
									<span class="block text-xs text-muted-foreground">{o.regionName}</span>
								{/if}
							</span>
						</p>
						{#if o.pickupContactName || o.pickupContactPhone}
							<p class="flex items-center gap-2">
								<Phone class="size-4 shrink-0 text-muted-foreground" />
								<span>
									{o.pickupContactName ?? 'At the address'}
									{#if o.pickupContactPhone}
										· <a class="underline" href="tel:{o.pickupContactPhone}"
											>{o.pickupContactPhone}</a
										>
									{/if}
								</span>
							</p>
						{/if}
						{#if o.accessNotes}
							<p class="rounded-lg bg-muted/50 p-3 text-muted-foreground">{o.accessNotes}</p>
						{/if}
					</div>
				{/if}

				{#if o.scheduledFor}
					<Separator class="my-4" />
					<p class="text-sm">
						<span class="font-medium">Booked for {fmtDay(o.scheduledFor)}</span>
						{#if o.scheduledWindow}<span class="text-muted-foreground">
								· {o.scheduledWindow}</span
							>{/if}
						{#if o.assigneeName}
							<span class="block text-xs text-muted-foreground">Assigned to {o.assigneeName}</span>
						{/if}
					</p>
				{/if}
			</Card.Root>

			<!-- ==================== The trail ==================== -->
			{#if o.reviewNotes || o.declineReason || o.intakeNotes || o.distributionNotes}
				<Card.Root class="p-6">
					<h2 class="mb-4 font-heading text-lg font-semibold">What has been recorded</h2>
					<dl class="flex flex-col gap-3 text-sm">
						{#if o.reviewNotes}
							<div>
								<dt class="text-xs tracking-wide text-muted-foreground uppercase">
									On review{data.reviewerName ? ` · ${data.reviewerName}` : ''}
								</dt>
								<dd>{o.reviewNotes}</dd>
							</div>
						{/if}
						{#if o.declineReason}
							<div>
								<dt class="text-xs tracking-wide text-muted-foreground uppercase">
									Why it was declined
								</dt>
								<dd>{o.declineReason}</dd>
							</div>
						{/if}
						{#if o.intakeNotes}
							<div>
								<dt class="text-xs tracking-wide text-muted-foreground uppercase">
									At intake{data.receiverName ? ` · ${data.receiverName}` : ''}
								</dt>
								<dd>{o.intakeNotes}</dd>
							</div>
						{/if}
						{#if o.distributionNotes}
							<div>
								<dt class="text-xs tracking-wide text-muted-foreground uppercase">Where it went</dt>
								<dd>{o.distributionNotes}</dd>
							</div>
						{/if}
					</dl>
				</Card.Root>
			{/if}
		</div>

		<!-- ==================== Side column ==================== -->
		<div class="flex flex-col gap-4">
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">Who is giving</h2>

				<div class="flex flex-col gap-2 text-sm">
					<p class="font-medium">{donorLabel}</p>
					{#if o.organisationName && o.donorName !== o.organisationName}
						<p class="text-muted-foreground">Contact: {o.donorName}</p>
					{/if}
					<Badge variant="outline" class="w-fit">{DONOR_TYPE_LABELS[o.donorType]}</Badge>

					{#if o.donorPhone}
						<p class="flex items-center gap-2">
							<Phone class="size-4 text-muted-foreground" />
							<a class="underline" href="tel:{o.donorPhone}">{o.donorPhone}</a>
						</p>
					{/if}
					{#if o.donorEmail}
						<p class="flex items-center gap-2">
							<Mail class="size-4 text-muted-foreground" />
							<a class="truncate underline" href="mailto:{o.donorEmail}">{o.donorEmail}</a>
						</p>
					{/if}

					<p class="text-xs text-muted-foreground">
						Prefers {CONTACT_CHANNEL_LABELS[o.preferredContactChannel]}{o.bestTimeToContact
							? ` · ${o.bestTimeToContact}`
							: ''}
					</p>

					{#if o.isDiaspora}<Badge variant="secondary" class="w-fit">Giving from abroad</Badge>{/if}
					{#if o.isAnonymous}
						<Badge variant="secondary" class="w-fit">Asked to stay anonymous</Badge>
					{:else if o.recognitionName}
						<p class="text-xs text-muted-foreground">Thank them as: {o.recognitionName}</p>
					{/if}

					{#if o.donorDonationCount}
						<p class="text-xs text-muted-foreground">
							Has also given {o.donorDonationCount}
							{o.donorDonationCount === 1 ? 'gift' : 'gifts'} of money.
						</p>
					{/if}

					{#if o.donorMessage}
						<p class="mt-2 rounded-lg bg-muted/50 p-3 text-muted-foreground italic">
							“{o.donorMessage}”
						</p>
					{/if}

					{#if o.heardAbout}
						<p class="text-xs text-muted-foreground">Heard about us: {o.heardAbout}</p>
					{/if}

					<Separator class="my-1" />

					<p class="text-xs text-muted-foreground">
						{#if o.consentToContactAt}
							Consented to being contacted on {fmt(o.consentToContactAt)}.
						{:else}
							No contact consent recorded — ring only about this offer.
						{/if}
					</p>
				</div>
			</Card.Root>

			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">Paperwork</h2>
				<dl class="flex flex-col gap-2 text-sm">
					<div class="flex justify-between gap-2">
						<dt class="text-muted-foreground">Receipt asked for</dt>
						<dd>{o.receiptRequested ? 'Yes' : 'No'}</dd>
					</div>
					<div class="flex justify-between gap-2">
						<dt class="text-muted-foreground">Tax receipt</dt>
						<dd>{o.taxReceiptRequired ? (o.taxIdNumber ?? 'Yes, no TIN given') : 'Not needed'}</dd>
					</div>
					<div class="flex justify-between gap-2">
						<dt class="text-muted-foreground">Meant for</dt>
						<dd class="text-right">
							{o.pillarName ?? o.initiativeName ?? 'Where most needed'}
						</dd>
					</div>
					<div class="flex justify-between gap-2">
						<dt class="text-muted-foreground">Donor told</dt>
						<dd>
							{o.acknowledgementSentAt ? fmt(o.acknowledgementSentAt) : 'Not since it arrived'}
						</dd>
					</div>
				</dl>
			</Card.Root>

			<Card.Root class="p-6">
				<h2 class="mb-3 font-heading text-lg font-semibold">Who is handling it</h2>
				<form
					method="post"
					action="?/assign"
					use:enhance={() =>
						async ({ update }) =>
							await update({ reset: false })}
					class="flex flex-col gap-3"
				>
					<SelectComp bind:value={assignedToId} items={staffItems} name="assignedToId" />
					<Button type="submit" variant="outline" size="sm">Save</Button>
				</form>
			</Card.Root>
		</div>
	</div>
</div>

<!-- ==================== Accept ==================== -->
<Dialog.Root open={open === 'decide'} onOpenChange={(value) => !value && (open = null)}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Accept this gift</Dialog.Title>
			<Dialog.Description>
				You are saying the Foundation can take {o.summary} and has somewhere to put it.
			</Dialog.Description>
		</Dialog.Header>

		<form method="post" action="?/decide" use:enhance class="flex flex-col gap-4">
			<input type="hidden" name="outcome" value="accepted" />

			<div class="flex flex-col gap-2">
				<Label for="accept-note">Anything to note?</Label>
				<Textarea
					id="accept-note"
					name="note"
					rows={3}
					placeholder="Taking the coats but not the mattress; storing at the Bole office."
				/>
			</div>

			{#if o.donorEmail}
				<label class="flex items-center gap-2 text-sm">
					<Checkbox name="notify" checked />
					Email {o.donorEmail} to say we can take it
				</label>
			{:else}
				<p class="text-xs text-muted-foreground">
					No email address — ring {o.donorPhone ?? 'them'} to confirm.
				</p>
			{/if}

			<div class="flex gap-2">
				<Button type="submit" class="flex-1"><CheckCircle2 class="size-4" /> Accept</Button>
				<Button type="button" variant="outline" onclick={() => (open = null)}>Cancel</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- ==================== Decline ==================== -->
<Dialog.Root open={open === 'decline'} onOpenChange={(value) => !value && (open = null)}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Decline this gift</Dialog.Title>
			<Dialog.Description>
				Somebody offered something and we are saying no. The reason is what they will read, so write
				it for them rather than for the file.
			</Dialog.Description>
		</Dialog.Header>

		<form method="post" action="?/decide" use:enhance class="flex flex-col gap-4">
			<input type="hidden" name="outcome" value="declined" />

			<div class="flex flex-col gap-2">
				<Label for="decline-note">Why?</Label>
				<Textarea
					id="decline-note"
					name="note"
					rows={3}
					required
					placeholder="We have no cold storage for fresh food this month, so it would spoil before it reached anybody."
				/>
			</div>

			{#if o.donorEmail}
				<label class="flex items-center gap-2 text-sm">
					<Checkbox name="notify" checked />
					Email {o.donorEmail} with this reason
				</label>
			{/if}

			<div class="flex gap-2">
				<Button type="submit" variant="destructive" class="flex-1">
					<Ban class="size-4" /> Decline
				</Button>
				<Button type="button" variant="outline" onclick={() => (open = null)}>Cancel</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- ==================== Schedule ==================== -->
<Dialog.Root open={open === 'schedule'} onOpenChange={(value) => !value && (open = null)}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Book the handover</Dialog.Title>
			<Dialog.Description>
				{#if o.handoverMethod === 'pickup'}
					We go to {o.pickupCity ?? 'them'}. {o.availableFrom || o.availableUntil
						? `They are available ${o.availableFrom ? fmt(o.availableFrom) : 'any time'}${o.availableUntil ? ` until ${fmt(o.availableUntil)}` : ''}.`
						: ''}
				{:else}
					The donor brings it in.
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<form method="post" action="?/schedule" use:enhance class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="scheduledFor">Day</Label>
				<Input
					id="scheduledFor"
					name="scheduledFor"
					type="date"
					required
					value={o.scheduledFor ?? ''}
					min={today}
				/>
			</div>

			<div class="flex flex-col gap-2">
				<Label for="scheduledWindow">Time window</Label>
				<Input
					id="scheduledWindow"
					name="scheduledWindow"
					value={o.scheduledWindow ?? ''}
					placeholder="Between 9 and 12"
				/>
			</div>

			<div class="flex flex-col gap-2">
				<Label for="schedule-assignee">Who is going?</Label>
				<SelectComp bind:value={assignedToId} items={staffItems} name="assignedToId" />
			</div>

			{#if o.donorEmail}
				<label class="flex items-center gap-2 text-sm">
					<Checkbox name="notify" checked />
					Email {o.donorEmail} with the day
				</label>
			{/if}

			<div class="flex gap-2">
				<Button type="submit" class="flex-1"><CalendarClock class="size-4" /> Book it</Button>
				<Button type="button" variant="outline" onclick={() => (open = null)}>Cancel</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- ==================== Intake ==================== -->
<Dialog.Root open={open === 'receive'} onOpenChange={(value) => !value && (open = null)}>
	<Dialog.Content class="max-h-[85vh] max-w-lg overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>Count it in</Dialog.Title>
			<Dialog.Description>
				What actually arrived, line by line. Leave a box alone if all of it came — put a zero if a
				line never turned up.
			</Dialog.Description>
		</Dialog.Header>

		<form method="post" action="?/receive" use:enhance class="flex flex-col gap-4">
			<div class="flex flex-col gap-3">
				{#each data.items as item (item.id)}
					<div class="rounded-lg border p-3">
						<input type="hidden" name="itemId" value={item.id} />
						<p class="text-sm font-medium">{item.description}</p>
						<p class="text-xs text-muted-foreground">
							Offered: {item.quantity}
							{item.unit}
						</p>
						<div class="mt-2 grid gap-2 sm:grid-cols-[6rem_1fr]">
							<Input
								type="number"
								min="0"
								name="accepted-{item.id}"
								placeholder={String(item.quantity)}
								aria-label="How many {item.unit} of {item.description} arrived"
							/>
							<Input name="note-{item.id}" placeholder="Anything wrong with it?" />
						</div>
					</div>
				{/each}
			</div>

			<div class="flex flex-col gap-2">
				<Label for="intakeNotes">Notes on the intake</Label>
				<Textarea
					id="intakeNotes"
					name="intakeNotes"
					rows={2}
					placeholder="Stored in the back room; two boxes are damp and need drying out."
				/>
			</div>

			{#if o.donorEmail}
				<label class="flex items-center gap-2 text-sm">
					<Checkbox name="notify" checked />
					Email {o.donorEmail} to say it arrived
				</label>
			{/if}

			<div class="flex gap-2">
				<Button type="submit" class="flex-1"><PackageCheck class="size-4" /> Take it in</Button>
				<Button type="button" variant="outline" onclick={() => (open = null)}>Cancel</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- ==================== Distribute ==================== -->
<Dialog.Root open={open === 'distribute'} onOpenChange={(value) => !value && (open = null)}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Record where it went</Dialog.Title>
			<Dialog.Description>
				The last thing anybody will read about this gift. It is what lets us answer the donor when
				they ask what happened to it.
			</Dialog.Description>
		</Dialog.Header>

		<form method="post" action="?/distribute" use:enhance class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="distributionNotes">Where the goods went</Label>
				<Textarea
					id="distributionNotes"
					name="distributionNotes"
					rows={3}
					required
					placeholder="Given to 14 families through the Kolfe elder-care visits on 3 September."
				/>
			</div>

			<div class="flex gap-2">
				<Button type="submit" class="flex-1"><Package class="size-4" /> Close this gift</Button>
				<Button type="button" variant="outline" onclick={() => (open = null)}>Cancel</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- ==================== Withdrawn ==================== -->
<Dialog.Root open={open === 'cancel'} onOpenChange={(value) => !value && (open = null)}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Mark as withdrawn</Dialog.Title>
			<Dialog.Description>
				For when the donor changes their mind or gives the goods elsewhere. Nothing is sent to them.
			</Dialog.Description>
		</Dialog.Header>

		<form method="post" action="?/cancel" use:enhance class="flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<Label for="cancel-note">What happened?</Label>
				<Input id="cancel-note" name="note" placeholder="Gave it to their church instead." />
			</div>

			<div class="flex gap-2">
				<Button type="submit" variant="destructive" class="flex-1">
					<Undo2 class="size-4" /> Mark withdrawn
				</Button>
				<Button type="button" variant="outline" onclick={() => (open = null)}>Cancel</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
