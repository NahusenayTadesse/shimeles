<script lang="ts">
	import { toast } from 'svelte-sonner';
	import DataTable from '$lib/components/Table/data-table.svelte';
	import BadgeCell from '$lib/dashboard/badge-cell.svelte';
	import TwoLineCell from '$lib/dashboard/two-line-cell.svelte';
	import PledgeActions from './pledge-actions.svelte';
	import { indexColumn } from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import { formatMoney } from '$lib/money';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.reference) toast.success(`Reminder sent, reference ${form.reference}`);
		else if (form?.ok) toast.success('Saved');
	});

	const isDue = (date: string | null) => Boolean(date && date <= data.today);

	const designation = (row: (typeof data.rows)[number]) =>
		row.pillarName ?? row.initiativeName ?? 'Where most needed';

	const columns = [
		indexColumn,
		{
			id: 'donor',
			header: 'Donor',
			cell: ({ row }: any) =>
				renderComponent(TwoLineCell, {
					primary: row.original.donorName ?? '-',
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
			cell: ({ row }: any) => designation(row.original)
		},
		{
			id: 'nextReminderDate',
			header: 'Next reminder',
			cell: ({ row }: any) => {
				const due = isDue(row.original.nextReminderDate) && row.original.status === 'active';
				return renderComponent(TwoLineCell, {
					primary: row.original.nextReminderDate ?? '-',
					secondary: due ? 'Due' : null
				});
			}
		},
		{
			id: 'status',
			header: 'Status',
			cell: ({ row }: any) =>
				renderComponent(BadgeCell, {
					label: row.original.status,
					variant: row.original.status === 'active' ? 'default' : 'outline',
					class: 'capitalize'
				})
		},
		{
			id: 'actions',
			header: '',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(PledgeActions, { id: row.original.id, status: row.original.status })
		}
	];
</script>

<svelte:head><title>Recurring pledges · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="font-heading text-2xl font-bold">Recurring pledges</h1>
		<p class="mt-1 max-w-3xl text-sm text-muted-foreground">
			Bank transfers in Ethiopia cannot be charged automatically, so a monthly donor is somebody who
			gets a reminder and makes a transfer. Sending a reminder also opens the donation, so the
			transfer has a reference to match against when it arrives.
		</p>
	</div>

	{#key data.rows}
		<DataTable
			{columns}
			data={data.rows}
			fileName="Pledges"
			emptyMessage="Recurring pledges appear here once a donor sets one up."
		/>
	{/key}
</div>
