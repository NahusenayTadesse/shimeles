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
		{
			name: 'question',
			label: 'Question',
			required: true,
			placeholder: 'How do I make the transfer?'
		},
		{ name: 'answer', label: 'Answer', type: 'textarea', rows: 4, required: true },
		{ name: 'questionAm', label: 'Question (Amharic)' },
		{ name: 'answerAm', label: 'Answer (Amharic)', type: 'textarea', rows: 4 },
		{
			name: 'context',
			label: 'Shown on',
			placeholder: 'donate'
		},
		{ name: 'isActive', label: 'Shown in the panel', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = ['question', 'answer', 'questionAm', 'answerAm', 'context', 'isActive', 'sortOrder'];

	const columns = [
		indexColumn,
		column('context', 'Page'),
		column('question', 'Question'),
		longColumn('answer', 'Answer'),
		{
			accessorKey: 'answerAm',
			header: 'Amharic',
			cell: ({ row }: any) => (row.original.questionAm && row.original.answerAm ? 'Yes' : '-')
		},
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit help topic', keys }),
		deleteColumn(data.deleteForm, 'question')
	];
</script>

<ContentPage
	title="Help panel"
	description="The questions the help button answers on the public pages. Donors were arriving at the transfer step unsure what a reference is for, and that is a paragraph somebody should be able to rewrite the same afternoon. Fill in both Amharic boxes on a topic and the panel offers the language switch; leave them empty and it stays English."
	addTitle="Add help topic"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
