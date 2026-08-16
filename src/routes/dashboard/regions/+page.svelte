<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import { column, deleteColumn, editColumn, indexColumn } from '$lib/dashboard/columns';
	import { yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const fields: CrudField[] = [
		{ name: 'name', label: 'Name (English)', required: true },
		{ name: 'slug', label: 'Slug', required: true, placeholder: 'addis-ababa' },
		{ name: 'isDefault', label: 'Default for new records', type: 'select', items: yesNo },
		{ name: 'isActive', label: 'Active', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = ['name', 'slug', 'isDefault', 'isActive', 'sortOrder'];

	const columns = [
		indexColumn,
		column('name', 'Name'),
		column('slug', 'Slug'),
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit region', keys }),
		deleteColumn(data.deleteForm, 'name')
	];
</script>

<ContentPage
	title="Regions"
	description="Where the Foundation works. Every application, beneficiary and donation records a region, so adding one here is all that expanding beyond Addis Ababa needs."
	addTitle="Add region"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
