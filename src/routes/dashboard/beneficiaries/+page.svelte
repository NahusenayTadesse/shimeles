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
	import RowLink from '$lib/dashboard/row-link.svelte';
	import { toItems } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const genders = [
		{ value: 'undisclosed', name: 'Not disclosed' },
		{ value: 'female', name: 'Female' },
		{ value: 'male', name: 'Male' },
		{ value: 'other', name: 'Other' }
	];

	const householdItems = [
		{ value: '', name: '— none —' },
		...toItems(data.householdOptions, 'label')
	];

	const fields: CrudField[] = [
		{ name: 'fullName', label: 'Full name', required: true },
		{ name: 'phone', label: 'Phone', type: 'tel' },
		{ name: 'email', label: 'Email', type: 'email' },
		{ name: 'householdId', label: 'Household', type: 'combo', items: householdItems },
		{ name: 'regionId', label: 'Region', type: 'select', items: toItems(data.regionOptions) },
		{ name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
		{ name: 'gender', label: 'Gender', type: 'select', items: genders },
		{ name: 'notes', label: 'Internal notes', type: 'textarea', rows: 5 }
	];

	const keys = [
		'fullName',
		'phone',
		'email',
		'householdId',
		'regionId',
		'dateOfBirth',
		'gender',
		'notes'
	];

	const columns = [
		indexColumn,
		column('fullName', 'Name'),
		column('phone', 'Phone'),
		column('email', 'Email'),
		longColumn('notes', 'Notes'),
		{
			id: 'history',
			header: 'History',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(RowLink, {
					href: `/dashboard/beneficiaries/${row.original.id}`,
					label: 'Open'
				})
		},
		editColumn({ data: data.editForm, fields, title: 'Edit beneficiary', keys }),
		deleteColumn(data.deleteForm, 'fullName')
	];
</script>

<ContentPage
	title="Beneficiaries"
	description="One record per person or household, so a family that came back is recognised rather than re-entered. Open a record to see their applications and everything disbursed on their behalf."
	addTitle="Add beneficiary"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
