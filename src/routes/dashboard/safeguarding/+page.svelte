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
		{ name: 'label', label: 'Check', required: true },
		{ name: 'description', label: 'Guidance for the coordinator', type: 'textarea', rows: 3 },
		{
			name: 'professionalOnly',
			label: 'Only for professional volunteers',
			type: 'select',
			items: yesNo
		},
		{ name: 'isActive', label: 'Required', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = ['label', 'description', 'professionalOnly', 'isActive', 'sortOrder'];

	const columns = [
		indexColumn,
		column('label', 'Check'),
		longColumn('description', 'Guidance'),
		column('professionalOnly', 'Professionals only'),
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit check', keys }),
		deleteColumn(data.deleteForm, 'label')
	];
</script>

<ContentPage
	title="Safeguarding checklist"
	description="Every active check must be completed before a volunteer can be approved. The approve action refuses on the server, not just in the interface. Adding a check here re-opens the gate on volunteers already approved against the shorter list."
	addTitle="Add check"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
