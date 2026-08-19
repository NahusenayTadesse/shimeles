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
	import { iconItems } from '$lib/components/dynamic-icon.svelte';
	import { yesNo } from '$lib/dashboard/options';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import RowLink from '$lib/dashboard/row-link.svelte';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const statuses = [
		{ value: 'planned', name: 'Planned' },
		{ value: 'in_development', name: 'In development' },
		{ value: 'active', name: 'Active' }
	];

	const fields: CrudField[] = [
		{ name: 'name', label: 'Name (English)', required: true },
		{ name: 'slug', label: 'URL slug', required: true },
		{ name: 'description', label: 'Description', type: 'textarea', rows: 4 },
		{ name: 'icon', label: 'Icon', type: 'combo', items: iconItems },
		{ name: 'image', label: 'Photo', type: 'file' },
		{ name: 'status', label: 'Status', type: 'select', items: statuses },
		{ name: 'goalAmount', label: 'Fundraising goal (birr)', type: 'number' },
		{ name: 'currency', label: 'Currency', placeholder: 'ETB' },
		{ name: 'isActive', label: 'Visible on the site', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = [
		'name',
		'slug',
		'description',
		'icon',
		'status',
		'goalAmount',
		'currency',
		'isActive',
		'sortOrder'
	];

	const columns = [
		indexColumn,
		column('name', 'Name'),
		column('status', 'Status'),
		longColumn('description', 'Description'),
		imageColumn('image', 'Photo'),
		column('sortOrder', 'Order'),
		{
			id: 'media',
			header: 'Photos & video',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(RowLink, {
					href: `/dashboard/media/initiative/${row.original.id}`,
					label: 'Photos & video'
				})
		},
		editColumn({
			data: data.editForm,
			fields,
			title: 'Edit initiative',
			keys,
			fileKeys: ['image']
		}),
		deleteColumn(data.deleteForm, 'name')
	];
</script>

<ContentPage
	title="Future initiatives"
	description="The hospital, the tuition-free boarding schools, the senior centres. These render as 'planned' on the public site until you move their status on."
	addTitle="Add initiative"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
