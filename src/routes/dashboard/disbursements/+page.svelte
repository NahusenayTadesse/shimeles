<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import {
		column,
		deleteColumn,
		editColumn,
		indexColumn,
		longColumn
	} from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import MoneyCell from '$lib/dashboard/money-cell.svelte';
	import { toItems } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const sources = [
		{ value: 'general_fund', name: 'General fund' },
		{ value: 'designated', name: 'Designated giving' }
	];

	const none = { value: '', name: 'None' };

	const fields: CrudField[] = [
		{ name: 'paidTo', label: 'Paid to', required: true, placeholder: 'Tikur Anbessa Hospital' },
		{ name: 'amount', label: 'Amount (birr)', type: 'number', required: true },
		{ name: 'currency', label: 'Currency', placeholder: 'ETB' },
		{ name: 'disbursementDate', label: 'Date paid', type: 'date', required: true },
		{
			name: 'formSubmissionId',
			label: 'Against which case',
			type: 'combo',
			items: [none, ...toItems(data.caseOptions, 'reference')]
		},
		{
			name: 'beneficiaryId',
			label: 'For which beneficiary',
			type: 'combo',
			items: [none, ...toItems(data.beneficiaryOptions, 'fullName')]
		},
		{
			name: 'pillarId',
			label: 'Programme',
			type: 'select',
			items: [none, ...toItems(data.pillarOptions)]
		},
		{ name: 'fundSource', label: 'Funded from', type: 'select', items: sources },
		{
			name: 'designationPillarId',
			label: 'Designated to',
			type: 'select',
			items: [none, ...toItems(data.pillarOptions)]
		},
		{ name: 'narrative', label: 'What it was for', type: 'textarea', rows: 3 }
	];

	const keys = [
		'paidTo',
		'amount',
		'currency',
		'disbursementDate',
		'formSubmissionId',
		'beneficiaryId',
		'pillarId',
		'fundSource',
		'designationPillarId',
		'narrative'
	];

	const columns = [
		indexColumn,
		column('disbursementDate', 'Date'),
		column('paidTo', 'Paid to'),
		{
			accessorKey: 'amount',
			header: 'Amount',
			cell: ({ row }: any) =>
				renderComponent(MoneyCell, { amount: row.original.amount, currency: row.original.currency })
		},
		column('fundSource', 'Funded from'),
		longColumn('narrative', 'Purpose'),
		editColumn({ data: data.editForm, fields, title: 'Edit disbursement', keys }),
		deleteColumn(data.deleteForm, 'paidTo')
	];
</script>

<ContentPage
	title="Disbursements"
	description="Where the money actually went: the hospital, the school, the supplier, and the date. This is what turns 'we helped 40 families' into something a donor can check."
	addTitle="Record a disbursement"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
	caseScoped
/>
