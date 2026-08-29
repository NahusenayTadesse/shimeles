<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import ActionNote from '$lib/dashboard/action-note.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import DataTable from '$lib/components/Table/data-table.svelte';
	import FilterBar from '$lib/dashboard/filter-bar.svelte';
	import TwoLineCell from '$lib/dashboard/two-line-cell.svelte';
	import DonationReferenceCell from './donation-reference-cell.svelte';
	import DonationActionsCell from './donation-actions-cell.svelte';
	import { indexColumn } from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import { formatMoney, toMajor, toMoneyTotals } from '$lib/money';
	import MoneyTotals from '$lib/dashboard/money-totals.svelte';
	import { CheckCircle2 } from '@lucide/svelte';
	import { formatDate } from '$lib/dates';

	let { data, form } = $props();

	let search = $state(data.filters.search);
	/** Which donation's match dialog is open. */
	let matching = $state<number | null>(null);

	/**
	 * The last outcome, kept on screen after the toast has gone.
	 *
	 * Reconciliation is the case that needs it: confirming a gift changes the
	 * public total, and "did that go through?" should be answerable by looking
	 * at the screen rather than by remembering a notification that faded.
	 */
	let lastAction = $state<{ message: string; at: number } | null>(null);

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.reconciled) {
			toast.success('Gift confirmed. It now counts toward the public total.');
			lastAction = {
				message: 'Gift confirmed. It now counts toward the public total.',
				at: Date.now()
			};
			matching = null;
		} else if (form?.receiptSent) {
			toast.success('Receipt sent.');
			lastAction = { message: 'Receipt sent to the donor.', at: Date.now() };
		} else if (form?.ok) {
			toast.success('Saved');
			lastAction = { message: 'Saved.', at: Date.now() };
		}
	});

	const statusTabs = [
		{ value: 'pending_reconciliation', label: 'Awaiting matching' },
		{ value: 'completed', label: 'Confirmed' },
		{ value: 'pledged', label: 'Pledged' },
		{ value: 'failed', label: 'Never arrived' },
		{ value: 'all', label: 'All' }
	];

	/**
	 * The totals rows now arrive one per status *per currency*, so a status has
	 * a gift count and a list of totals rather than one figure. Adding the birr
	 * and the dollar rows together would produce a number matching no bank
	 * statement anywhere.
	 */
	/**
	 * Named for the chips above the table. "Awaiting matching" is where the
	 * screen opens rather than something anybody chose, so it gets no chip.
	 */
	const activeFilters = $derived(
		[
			data.filters.search && { key: 'q', label: `Matching "${data.filters.search}"` },
			data.filters.status &&
				data.filters.status !== 'pending_reconciliation' && {
					key: 'status',
					label: statusTabs.find((tab) => tab.value === data.filters.status)?.label ?? 'A status'
				}
		].filter(Boolean) as { key: string; label: string }[]
	);

	const summary = (status: string) => {
		const rows = data.totals.filter((row) => row.status === status);
		return {
			gifts: rows.reduce((sum, row) => sum + Number(row.total), 0),
			totals: toMoneyTotals(rows)
		};
	};

	const fmt = (value: Date | string | null) => formatDate(value, '-');

	const designationLabel = (row: (typeof data.rows)[number]) =>
		row.pillarName ?? row.initiativeName ?? 'Where most needed';

	const columns = [
		indexColumn,
		{
			id: 'reference',
			header: 'Reference',
			cell: ({ row }: any) =>
				renderComponent(DonationReferenceCell, {
					reference: row.original.reference,
					monthly: row.original.frequency === 'monthly',
					message: row.original.donorMessage
				})
		},
		{
			id: 'donor',
			header: 'Donor',
			cell: ({ row }: any) =>
				renderComponent(TwoLineCell, {
					primary: row.original.isAnonymous ? 'Anonymous' : (row.original.donorName ?? '-'),
					secondary: row.original.donorEmail ?? row.original.donorPhone
				})
		},
		{
			id: 'amount',
			header: 'Amount',
			cell: ({ row }: any) => formatMoney(row.original.amount, row.original.currency)
		},
		{
			id: 'for',
			header: 'For',
			enableSorting: false,
			cell: ({ row }: any) => designationLabel(row.original)
		},
		{
			id: 'method',
			header: 'Method',
			cell: ({ row }: any) => row.original.methodName ?? '-'
		},
		{
			id: 'createdAt',
			header: 'Pledged',
			cell: ({ row }: any) => fmt(row.original.createdAt)
		},
		{
			id: 'actions',
			header: '',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(DonationActionsCell, {
					id: row.original.id,
					status: row.original.status,
					completedAt: row.original.completedAt,
					receiptSentAt: row.original.receiptSentAt,
					hasEmail: Boolean(row.original.donorEmail),
					fmt,
					onMatch: (id: number) => (matching = id)
				})
		}
	];
</script>

<svelte:head><title>Donations · Dashboard</title></svelte:head>

{#if lastAction}
	<div class="mx-auto mb-3 w-full">
		<ActionNote message={lastAction.message} at={lastAction.at} />
	</div>
{/if}

<div class="flex flex-col gap-4">
	<div>
		<h1 class="font-heading text-2xl font-bold">Donations & reconciliation</h1>
		<p class="mt-1 max-w-3xl text-sm text-muted-foreground">
			A gift pledged on the website is a promise, not money. Match it against your bank statement
			here to confirm it. Only confirmed gifts count toward the public "funds raised" figure.
		</p>
	</div>

	<div class="grid gap-4 sm:grid-cols-3">
		<Card.Root class="p-5">
			<p class="text-xs tracking-wide text-muted-foreground uppercase">Awaiting matching</p>
			<p class="mt-2 font-heading text-3xl font-semibold">
				{summary('pending_reconciliation').gifts}
			</p>
			<div class="text-xs text-muted-foreground">
				<span>Pledged</span>
				<MoneyTotals totals={summary('pending_reconciliation').totals} />
			</div>
		</Card.Root>
		<Card.Root class="p-5">
			<p class="text-xs tracking-wide text-muted-foreground uppercase">Confirmed</p>
			<MoneyTotals
				totals={summary('completed').totals}
				class="mt-2 font-heading text-3xl font-semibold text-success"
			/>
			<p class="text-xs text-muted-foreground">{summary('completed').gifts} gifts</p>
		</Card.Root>
		<Card.Root class="p-5">
			<p class="text-xs tracking-wide text-muted-foreground uppercase">Never arrived</p>
			<p class="mt-2 font-heading text-3xl font-semibold">{summary('failed').gifts}</p>
			<p class="text-xs text-muted-foreground">Closed off, not chased</p>
		</Card.Root>
	</div>

	<FilterBar
		bind:search
		placeholder="Reference code, donor name, email or phone…"
		active={activeFilters}
	>
		{#snippet children({ applyFilter })}
			{#each statusTabs as tab (tab.value)}
				<Button
					variant={data.filters.status === tab.value ? 'default' : 'outline'}
					size="sm"
					onclick={() => applyFilter('status', tab.value)}
				>
					{tab.label}
				</Button>
			{/each}
		{/snippet}
	</FilterBar>

	{#key data.rows}
		<DataTable
			{columns}
			data={data.rows}
			search={false}
			fileName="Donations"
			emptyMessage="Donations appear here once someone gives through the site, or when finance records a bank transfer."
		/>
	{/key}
</div>

<!-- The match dialog. Separate from the row so the bank reference is entered
     deliberately rather than being one stray click away. -->
{#each data.rows.filter((row) => row.id === matching) as row (row.id)}
	<Dialog.Root open onOpenChange={(open) => !open && (matching = null)}>
		<Dialog.Content class="max-w-md">
			<Dialog.Header>
				<Dialog.Title>Confirm this gift</Dialog.Title>
				<Dialog.Description>
					{row.isAnonymous ? 'Anonymous' : row.donorName} pledged
					{formatMoney(row.amount, row.currency)} with reference
					<span class="font-mono">{row.reference}</span>.
				</Dialog.Description>
			</Dialog.Header>

			<form
				method="post"
				action="?/reconcile"
				use:enhance={() =>
					async ({ update }) =>
						await update({ reset: false })}
				class="flex flex-col gap-4"
			>
				<input type="hidden" name="id" value={row.id} />

				<div class="flex flex-col gap-2">
					<Label for="bankReference">Bank reference or statement line</Label>
					<Textarea
						id="bankReference"
						name="bankReference"
						rows={2}
						placeholder="e.g. CBE transfer FT25123ABCD, 14 Aug"
					/>
					<p class="text-xs text-muted-foreground">
						Recorded in the reconciliation log so the match can be explained later.
					</p>
				</div>

				<div class="flex flex-col gap-2">
					<Label for="amountMatched">Amount actually received ({row.currency})</Label>
					<Input
						id="amountMatched"
						name="amountMatched"
						type="number"
						step="any"
						value={toMajor(row.amount, row.currency)}
					/>
					<p class="text-xs text-muted-foreground">
						Change this if the statement shows a different figure than was pledged.
					</p>
				</div>

				<div class="flex gap-2">
					<Button type="submit" class="flex-1">
						<CheckCircle2 class="size-4" /> Confirm gift
					</Button>
					<Button type="button" variant="outline" onclick={() => (matching = null)}>Cancel</Button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Root>
{/each}
