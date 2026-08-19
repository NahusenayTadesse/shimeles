<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import {
		column,
		deleteColumn,
		editColumn,
		indexColumn,
		longColumn
	} from '$lib/dashboard/columns';
	import { yesNo } from '$lib/dashboard/options';
	import { accentItems } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const fields: CrudField[] = [
		{ name: 'name', label: 'Name', required: true, placeholder: 'Field notes' },
		{ name: 'slug', label: 'URL slug', required: true, placeholder: 'field-notes' },
		{ name: 'description', label: 'Description', type: 'textarea', rows: 2 },
		{ name: 'color', label: 'Accent colour', type: 'select', items: accentItems },
		{ name: 'isActive', label: 'Show on the site', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = ['name', 'slug', 'description', 'color', 'isActive', 'sortOrder'];

	const columns = [
		indexColumn,
		column('name', 'Name'),
		column('slug', 'Slug'),
		longColumn('description', 'Description'),
		column('color', 'Accent'),
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit category', keys }),
		deleteColumn(data.deleteForm, 'name')
	];
</script>

<ContentPage
	title="Blog categories"
	description="The filter chips a reader sees at the top of /blog. Deleting one leaves its posts published and simply uncategorised."
	addTitle="Add category"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
