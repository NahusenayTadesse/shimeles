<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import { column, deleteColumn, editColumn, indexColumn } from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import RowLink from '$lib/dashboard/row-link.svelte';
	import { toItems, yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const pillarItems = [{ value: '', name: 'Not tied to a pillar' }, ...toItems(data.pillarOptions)];

	const contexts = [
		{ value: 'application', name: 'Assistance application' },
		{ value: 'volunteer', name: 'Volunteer application' }
	];

	const fields: CrudField[] = [
		{
			name: 'name',
			label: 'Internal name',
			required: true,
			placeholder: 'Medical Hardship application'
		},
		{ name: 'slug', label: 'URL slug', required: true, placeholder: 'application-medical' },
		{ name: 'title', label: 'Title shown to the public', required: true },
		{ name: 'pillarId', label: 'Pillar', type: 'combo', items: pillarItems },
		{ name: 'introText', label: 'Intro text', type: 'textarea', rows: 3 },
		{ name: 'successMessage', label: 'Message after submitting', type: 'textarea', rows: 2 },
		{ name: 'referencePrefix', label: 'Reference prefix', required: true, placeholder: 'MED' },
		{ name: 'statusContext', label: 'Workflow', type: 'select', items: contexts },
		{ name: 'requiresDocuments', label: 'Expects documents', type: 'select', items: yesNo },
		{
			name: 'isLowBarrier',
			label: 'Low barrier (no required contact details or uploads)',
			type: 'select',
			items: yesNo
		},
		{ name: 'isActive', label: 'Live on the site', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = [
		'name',
		'slug',
		'title',
		'pillarId',
		'introText',
		'successMessage',
		'referencePrefix',
		'statusContext',
		'requiresDocuments',
		'isLowBarrier',
		'isActive',
		'sortOrder'
	];

	const columns = [
		indexColumn,
		column('name', 'Form'),
		column('slug', 'Slug'),
		column('referencePrefix', 'Reference'),
		column('isLowBarrier', 'Low barrier'),
		{
			id: 'builder',
			header: 'Questions',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(RowLink, {
					href: `/dashboard/forms/${row.original.id}`,
					label: 'Edit questions'
				})
		},
		editColumn({ data: data.editForm, fields, title: 'Edit form', keys }),
		deleteColumn(data.deleteForm, 'name')
	];
</script>

<ContentPage
	title="Forms"
	description="Every public form: the four application forms, the volunteer form, the contact form. Adding a question to one is a change here, not a developer job; use 'Edit questions'."
	addTitle="Add form"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
