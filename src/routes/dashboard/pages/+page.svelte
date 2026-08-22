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
	import { yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const fields: CrudField[] = [
		{ name: 'title', label: 'Title (English)', required: true },
		{ name: 'slug', label: 'URL slug', required: true, placeholder: 'about' },
		{ name: 'metaDescription', label: 'Search description', type: 'textarea', rows: 2 },
		{ name: 'shareImage', label: 'Social share image', type: 'file' },
		{ name: 'isPublished', label: 'Published', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = ['title', 'slug', 'metaDescription', 'isPublished', 'sortOrder'];

	const columns = [
		indexColumn,
		column('title', 'Title'),
		column('slug', 'Slug'),
		longColumn('metaDescription', 'Search description'),
		{
			id: 'blocks',
			header: 'Content',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(RowLink, {
					href: `/dashboard/pages/${row.original.id}`,
					label: 'Edit blocks'
				})
		},
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit page', keys, fileKeys: ['shareImage'] }),
		deleteColumn(data.deleteForm, 'title')
	];
</script>

<ContentPage
	title="Pages"
	description="Every public page. This screen controls the page itself: its address, title and search description. Use 'Edit blocks' to change what is actually on it."
	addTitle="Add page"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
