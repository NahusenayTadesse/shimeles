<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import { column, deleteColumn, editColumn, indexColumn } from '$lib/dashboard/columns';
	import { yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const fields: CrudField[] = [
		{ name: 'name', label: 'Group name', required: true },
		{ name: 'slug', label: 'Slug', required: true, placeholder: 'health' },
		{ name: 'description', label: 'Shown under the heading', type: 'textarea', rows: 2 },
		{ name: 'icon', label: 'Icon', placeholder: 'Stethoscope' },
		{ name: 'isActive', label: 'Shown on the form', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = ['name', 'slug', 'description', 'icon', 'isActive', 'sortOrder'];

	const columns = [
		indexColumn,
		column('name', 'Group'),
		column('slug', 'Slug'),
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit need group', keys }),
		deleteColumn(data.deleteForm, 'name')
	];
</script>

<ContentPage
	title="Need groups"
	description="The headings the apply form's list is broken into. A kind of help whose group is removed still appears, under 'Something else', so nothing a person can ask for disappears because of a tidy-up here."
	addTitle="Add need group"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
