<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import {
		column,
		deleteColumn,
		editColumn,
		indexColumn,
		longColumn
	} from '$lib/dashboard/columns';
	import { toItems } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const fields: CrudField[] = [
		{ name: 'label', label: 'Household name', required: true, placeholder: 'Abebe family' },
		{ name: 'regionId', label: 'Region', type: 'select', items: toItems(data.regionOptions) },
		{ name: 'notes', label: 'Internal notes', type: 'textarea', rows: 4 }
	];

	const keys = ['label', 'regionId', 'notes'];

	const columns = [
		indexColumn,
		column('label', 'Household'),
		longColumn('notes', 'Notes'),
		editColumn({ data: data.editForm, fields, title: 'Edit household', keys }),
		deleteColumn(data.deleteForm, 'label')
	];
</script>

<ContentPage
	title="Households"
	description="Family units. Grouping beneficiaries into a household is what lets a caseworker see that this family has been supported before."
	addTitle="Add household"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
