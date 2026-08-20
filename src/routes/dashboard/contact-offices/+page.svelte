<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import { column, deleteColumn, editColumn, indexColumn } from '$lib/dashboard/columns';
	import { toItems, yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const regionItems = $derived([{ value: '', name: 'None' }, ...toItems(data.regionOptions)]);

	const fields: CrudField[] = $derived([
		{ name: 'name', label: 'Office name', required: true, placeholder: 'Head office' },
		{ name: 'slug', label: 'Slug', required: true, placeholder: 'head-office' },
		{ name: 'addressLine', label: 'Address', placeholder: 'Bole, near Friendship Centre' },
		{ name: 'city', label: 'City', placeholder: 'Addis Ababa' },
		{ name: 'regionId', label: 'Region', type: 'select', items: regionItems },
		{ name: 'phone', label: 'Phone' },
		{ name: 'email', label: 'Email' },
		{ name: 'openingHours', label: 'Opening hours', placeholder: 'Monday to Friday, 9am to 5pm' },
		{ name: 'mapUrl', label: 'Map link', placeholder: 'https://maps.google.com/…' },
		{ name: 'isPrimary', label: 'Main office', type: 'select', items: yesNo },
		{ name: 'isActive', label: 'Shown on the contact page', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	]);

	const keys = [
		'name',
		'slug',
		'addressLine',
		'city',
		'regionId',
		'phone',
		'email',
		'openingHours',
		'mapUrl',
		'isPrimary',
		'isActive',
		'sortOrder'
	];

	const columns = $derived([
		indexColumn,
		column('name', 'Office'),
		column('city', 'City'),
		column('phone', 'Phone'),
		{
			accessorKey: 'isPrimary',
			header: 'Main',
			cell: ({ row }: any) => (row.original.isPrimary ? 'Yes' : '—')
		},
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit office', keys }),
		deleteColumn(data.deleteForm, 'name')
	]);
</script>

<ContentPage
	title="Offices"
	description="The addresses shown beside the contact form. Adding a second office when the Foundation expands is a row here — the contact.* site settings stay as the fallback for a site that has not added any."
	addTitle="Add office"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
