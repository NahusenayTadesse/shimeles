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

	const colors = [
		{ value: 'clay', name: 'Clay (terracotta)' },
		{ value: 'olive', name: 'Olive (green)' },
		{ value: 'plum', name: 'Plum (purple)' },
		{ value: 'sky', name: 'Sky (blue)' }
	];

	const fields: CrudField[] = [
		{ name: 'name', label: 'Name (English)', required: true },
		{ name: 'slug', label: 'URL slug', required: true, placeholder: 'medical-hardship' },
		{ name: 'summary', label: 'One-line summary', type: 'textarea', rows: 2 },
		{ name: 'description', label: 'Full description', type: 'richtext' },
		{ name: 'icon', label: 'Icon', type: 'combo', items: iconItems },
		{ name: 'color', label: 'Accent colour', type: 'select', items: colors },
		{ name: 'image', label: 'Photo', type: 'file' },
		{ name: 'hasPublicApplication', label: 'Show an "Apply" form', type: 'select', items: yesNo },
		{ name: 'isActive', label: 'Visible on the site', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = [
		'name',
		'slug',
		'summary',
		'description',
		'icon',
		'color',
		'hasPublicApplication',
		'isActive',
		'sortOrder'
	];

	const columns = [
		indexColumn,
		column('name', 'Name'),
		column('slug', 'Slug'),
		longColumn('summary', 'Summary'),
		imageColumn('image', 'Photo'),
		column('color', 'Colour'),
		column('sortOrder', 'Order'),
		{
			id: 'media',
			header: 'Photos & video',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(RowLink, {
					href: `/dashboard/media/pillar/${row.original.id}`,
					label: 'Photos & video'
				})
		},
		editColumn({ data: data.editForm, fields, title: 'Edit pillar', keys, fileKeys: ['image'] }),
		deleteColumn(data.deleteForm, 'name')
	];
</script>

<ContentPage
	title="Pillars"
	description="The programmes the Foundation runs. Each pillar drives its own page, its own application form and its own donation designation — adding one here adds all three."
	addTitle="Add pillar"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
