<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import { column, deleteColumn, editColumn, indexColumn } from '$lib/dashboard/columns';
	import { yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const categories = [
		{ value: 'medical', name: 'Medical' },
		{ value: 'mental_health', name: 'Mental health' },
		{ value: 'allied_health', name: 'Allied health' },
		{ value: 'public_health', name: 'Public health' },
		{ value: 'other', name: 'Other' }
	];

	const fields: CrudField[] = [
		{ name: 'name', label: 'Profession', required: true },
		{ name: 'slug', label: 'Slug', required: true, placeholder: 'clinical-psychologist' },
		{ name: 'category', label: 'Category', type: 'select', items: categories, required: true },
		{
			name: 'defaultLicensingBody',
			label: 'Usually licensed by',
			placeholder: 'Ethiopian Food and Drug Authority'
		},
		{
			name: 'requiresLicense',
			label: 'Licence required',
			type: 'select',
			items: yesNo,
			placeholder: 'Almost always yes; only trained-but-unlicensed roles are No'
		},
		{ name: 'description', label: 'Internal note', type: 'textarea', rows: 2 },
		{ name: 'isActive', label: 'Offered on the form', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = [
		'name',
		'slug',
		'category',
		'defaultLicensingBody',
		'requiresLicense',
		'description',
		'isActive',
		'sortOrder'
	];

	const categoryName = (value: string) =>
		categories.find((category) => category.value === value)?.name ?? value;

	const columns = [
		indexColumn,
		column('name', 'Profession'),
		{
			accessorKey: 'category',
			header: 'Category',
			cell: ({ row }: any) => categoryName(row.original.category)
		},
		column('defaultLicensingBody', 'Licensed by'),
		{
			accessorKey: 'requiresLicense',
			header: 'Licence',
			cell: ({ row }: any) => (row.original.requiresLicense ? 'Required' : 'Not licensed')
		},
		editColumn({ data: data.editForm, fields, title: 'Edit profession', keys }),
		deleteColumn(data.deleteForm, 'name')
	];
</script>

<ContentPage
	title="Medical and professional roles"
	description="The professions a volunteer can claim on the public form. Each claim becomes its own credential record with its own verification state, and an unverified one holds the volunteer out of approval and placement, so this list decides who ends up in front of the safeguarding gate."
	addTitle="Add profession"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
