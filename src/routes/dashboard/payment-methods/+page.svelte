<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import {
		column,
		deleteColumn,
		editColumn,
		imageColumn,
		indexColumn,
		longColumn
	} from '$lib/dashboard/columns';
	import { yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const kinds = [
		{ value: 'bank_transfer', name: 'Bank transfer' },
		{ value: 'mobile_money', name: 'Mobile money' },
		{ value: 'card', name: 'Card' },
		{ value: 'paypal', name: 'PayPal' },
		{ value: 'cash', name: 'Cash' }
	];

	const fields: CrudField[] = [
		{ name: 'name', label: 'Name', required: true },
		{ name: 'slug', label: 'Slug', required: true },
		{ name: 'kind', label: 'Type', type: 'select', items: kinds },
		{ name: 'logo', label: 'Logo', type: 'file' },
		{ name: 'instructions', label: 'Instructions for the donor', type: 'textarea', rows: 3 },
		{ name: 'isActive', label: 'Offered on the donate page', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = ['name', 'slug', 'kind', 'instructions', 'isActive', 'sortOrder'];

	const columns = [
		indexColumn,
		column('name', 'Name'),
		column('kind', 'Type'),
		imageColumn('logo', 'Logo'),
		longColumn('instructions', 'Instructions'),
		column('sortOrder', 'Order'),
		editColumn({
			data: data.editForm,
			fields,
			title: 'Edit payment method',
			keys,
			fileKeys: ['logo']
		}),
		deleteColumn(data.deleteForm, 'name')
	];
</script>

<ContentPage
	title="Payment methods"
	description="The ways a donor can send money. Bank transfers and mobile money go through reconciliation; card and PayPal do not."
	addTitle="Add method"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
