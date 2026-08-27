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
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const fields: CrudField[] = [
		{ name: 'key', label: 'Key', required: true, placeholder: 'form.submit_button' },
		{ name: 'en', label: 'English', type: 'textarea', rows: 2, required: true },
		// Read only where a visitor can ask for it — the help panel on /donate.
		// Everywhere else still renders the English, so a blank box changes nothing.
		{ name: 'am', label: 'Amharic', type: 'textarea', rows: 2 },
		{ name: 'group', label: 'Group', placeholder: 'form' },
		{ name: 'isActive', label: 'Active', type: 'select', items: yesNo }
	];

	const keys = ['key', 'en', 'am', 'group', 'isActive'];

	const columns = [
		indexColumn,
		column('group', 'Group'),
		column('key', 'Key'),
		longColumn('en', 'English'),
		longColumn('am', 'Amharic'),
		editColumn({ data: data.editForm, fields, title: 'Edit translation', keys }),
		deleteColumn(data.deleteForm, 'key')
	];
</script>

<ContentPage
	title="Translations"
	description="Short interface strings: button labels, field labels, status names. Edited here rather than in code, so a clumsy label is a dashboard fix and not a deploy."
	addTitle="Add string"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
