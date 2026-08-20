<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import { column, deleteColumn, editColumn, indexColumn } from '$lib/dashboard/columns';
	import { yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const fields: CrudField[] = [
		{ name: 'name', label: 'Language (English name)', required: true, placeholder: 'Afaan Oromo' },
		{ name: 'slug', label: 'Slug', required: true, placeholder: 'afaan-oromo' },
		{
			name: 'nativeName',
			label: 'Its own name',
			placeholder: 'Afaan Oromoo — this is what the applicant sees'
		},
		{ name: 'isActive', label: 'Offered on the apply form', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = ['name', 'slug', 'nativeName', 'isActive', 'sortOrder'];

	const columns = [
		indexColumn,
		column('name', 'Language'),
		column('nativeName', 'Its own name'),
		column('slug', 'Slug'),
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit language', keys }),
		deleteColumn(data.deleteForm, 'name')
	];
</script>

<ContentPage
	title="Languages"
	description="What an applicant can say they have written in. This is not the site's language — the site is English-only in v1 — it is how a case written in Afaan Oromo reaches somebody who reads Afaan Oromo. Adding a language here offers it on the apply form immediately."
	addTitle="Add language"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
