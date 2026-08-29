<script lang="ts">
	import DataTable from '$lib/components/Table/data-table.svelte';
	import BadgeCell from '$lib/dashboard/badge-cell.svelte';
	import { column, indexColumn } from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import MoneyTotals from '$lib/dashboard/money-totals.svelte';
	import { formatDate } from '$lib/dates';

	let { data } = $props();

	const fmt = (value: Date | string | null) => formatDate(value, '-');

	const columns = [
		indexColumn,
		column('fullName', 'Name'),
		{
			id: 'organisationName',
			header: 'Organisation',
			accessorFn: (row: any) => row.organisationName ?? 'Individual',
			cell: ({ row }: any) => row.original.organisationName ?? '-'
		},
		{
			id: 'contact',
			header: 'Contact',
			enableSorting: false,
			cell: ({ row }: any) => row.original.email ?? row.original.phone ?? '-'
		},
		{
			id: 'lifetime',
			header: 'Lifetime',
			// Every currency this donor has given in, kept apart. The comment here
			// used to say sorting used `lifetimeTotal` — it did not, because the
			// column had no accessor and so could not be sorted at all. Now it can,
			// on the largest single currency, which is the only orderable number a
			// multi-currency total has.
			accessorFn: (row: any) => Number(row.lifetimeTotal ?? 0),
			cell: ({ row }: any) => renderComponent(MoneyTotals, { totals: row.original.lifetimeTotals })
		},
		column('donationCount', 'Gifts'),
		{
			id: 'lastDonationAt',
			header: 'Last gift',
			// The timestamp sorts; the cell shows the short date.
			accessorFn: (row: any) => new Date(row.lastDonationAt ?? 0).getTime(),
			cell: ({ row }: any) => fmt(row.original.lastDonationAt)
		},
		{
			id: 'isDiaspora',
			header: 'Where',
			enableSorting: false,
			// The country when we have one, the diaspora flag when we do not —
			// "Diaspora" alone does not tell a fundraiser which embassy letter or
			// which currency a supporter needs.
			cell: ({ row }: any) =>
				renderComponent(BadgeCell, {
					label: row.original.country || (row.original.isDiaspora ? 'Diaspora' : 'Ethiopia'),
					variant: row.original.isDiaspora ? 'secondary' : 'outline'
				})
		}
	];
</script>

<svelte:head><title>Donors · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="font-heading text-2xl font-bold">Donors</h1>
		<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
			Lifetime totals count confirmed gifts only, and are recomputed when a gift is reconciled, they
			cannot be edited by hand, so they always agree with the ledger.
		</p>
	</div>

	{#key data.rows}
		<DataTable
			{columns}
			data={data.rows}
			fileName="Donors"
			emptyMessage="A donor record is created the first time someone gives."
		/>
	{/key}
</div>
