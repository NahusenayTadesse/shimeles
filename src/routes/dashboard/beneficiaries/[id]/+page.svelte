<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import StatusBadge from '$lib/dashboard/status-badge.svelte';
	import { formatMoney, sumByCurrency } from '$lib/money';
	import MoneyTotals from '$lib/dashboard/money-totals.svelte';
	import { ArrowLeft, Eye, Mail, Phone, Users } from '@lucide/svelte';
	import { formatDate } from '$lib/dates';

	let { data } = $props();

	const b = $derived(data.beneficiary);

	/**
	 * Per currency. A person helped with birr and with a diaspora dollar gift
	 * has received two totals, and the single figure this used to add up was
	 * santim plus cents printed with a birr sign in front.
	 */
	const totalReceived = $derived(
		sumByCurrency(
			data.payments,
			(row) => row.amount,
			(row) => row.currency
		)
	);

	const fmt = (value: Date | string | null) => formatDate(value, '-');
</script>

<svelte:head><title>{b.fullName} · Beneficiaries</title></svelte:head>

<div class="flex flex-col gap-4">
	<a
		href="/dashboard/beneficiaries"
		class={buttonVariants({ variant: 'ghost', size: 'sm', class: 'w-fit' })}
	>
		<ArrowLeft class="size-4" /> Back to beneficiaries
	</a>

	<div>
		<h1 class="font-heading text-2xl font-bold">{b.fullName}</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			On record since {fmt(b.createdAt)}{b.regionName ? ` · ${b.regionName}` : ''}
		</p>
	</div>

	{#if data.isScoped}
		<Alert.Root>
			<Eye class="size-4" />
			<Alert.Description>
				You are seeing this person's history for the programmes you are assigned to. They may have
				cases with other programmes that are not shown here.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<div class="grid gap-4 lg:grid-cols-[2fr_1fr]">
		<div class="flex flex-col gap-4">
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">Applications</h2>
				<div class="flex flex-col divide-y">
					{#each data.submissions as row (row.id)}
						<a
							href={`/dashboard/applications/${row.id}`}
							class="flex flex-wrap items-center gap-3 py-3 hover:bg-muted/40"
						>
							<span class="font-mono text-xs text-muted-foreground">{row.reference}</span>
							<span class="min-w-0 flex-1 truncate">{row.formName}</span>
							{#if row.pillarName}<Badge variant="secondary">{row.pillarName}</Badge>{/if}
							<StatusBadge label={row.statusLabel} color={row.statusColor} />
							<span class="text-xs text-muted-foreground">{fmt(row.createdAt)}</span>
						</a>
					{:else}
						<p class="py-6 text-center text-sm text-muted-foreground">
							No applications linked to this person yet.
						</p>
					{/each}
				</div>
			</Card.Root>

			<Card.Root class="p-6">
				<div class="mb-4 flex items-center justify-between gap-2">
					<h2 class="font-heading text-lg font-semibold">Support given</h2>
					<MoneyTotals totals={totalReceived} class="text-lg font-semibold" />
				</div>
				<div class="flex flex-col divide-y">
					{#each data.payments as row (row.id)}
						<div class="flex flex-wrap items-center justify-between gap-3 py-3">
							<div>
								<p class="font-medium">{row.paidTo}</p>
								<p class="text-xs text-muted-foreground">
									{row.date}{row.pillarName ? ` · ${row.pillarName}` : ''}
								</p>
							</div>
							<div class="flex items-center gap-2">
								<Badge variant="outline" class="capitalize">
									{row.fundSource.replace('_', ' ')}
								</Badge>
								<span class="font-medium">{formatMoney(row.amount, row.currency)}</span>
							</div>
						</div>
					{:else}
						<p class="py-6 text-center text-sm text-muted-foreground">
							Nothing disbursed on this person's behalf yet.
						</p>
					{/each}
				</div>
			</Card.Root>
		</div>

		<div class="flex flex-col gap-4">
			<Card.Root class="p-5">
				<h2 class="mb-3 font-heading text-base font-semibold">Contact</h2>
				<div class="flex flex-col gap-2 text-sm">
					{#if b.phone}
						<a href={`tel:${b.phone}`} class="flex items-center gap-2 hover:text-primary">
							<Phone class="size-4 text-muted-foreground" />{b.phone}
						</a>
					{/if}
					{#if b.email}
						<a href={`mailto:${b.email}`} class="flex items-center gap-2 hover:text-primary">
							<Mail class="size-4 text-muted-foreground" />{b.email}
						</a>
					{/if}
					{#if !b.phone && !b.email}
						<p class="text-muted-foreground">No contact details on record.</p>
					{/if}
				</div>
			</Card.Root>

			{#if b.householdLabel}
				<Card.Root class="p-5">
					<h2 class="mb-3 flex items-center gap-2 font-heading text-base font-semibold">
						<Users class="size-4 text-muted-foreground" />
						{b.householdLabel}
					</h2>
					<div class="flex flex-col gap-1 text-sm">
						{#each data.householdMembers as member (member.id)}
							<a
								href={`/dashboard/beneficiaries/${member.id}`}
								class="text-muted-foreground hover:text-foreground"
							>
								{member.fullName}
							</a>
						{:else}
							<p class="text-muted-foreground">The only person recorded in this household.</p>
						{/each}
					</div>
				</Card.Root>
			{/if}

			{#if b.notes}
				<Card.Root class="p-5">
					<h2 class="mb-3 font-heading text-base font-semibold">Internal notes</h2>
					<p class="text-sm whitespace-pre-wrap text-muted-foreground">{b.notes}</p>
				</Card.Root>
			{/if}
		</div>
	</div>
</div>
