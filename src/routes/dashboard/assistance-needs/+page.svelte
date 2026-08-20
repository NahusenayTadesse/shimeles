<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import { column, deleteColumn, editColumn, indexColumn } from '$lib/dashboard/columns';
	import { toItems, yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const categoryItems = $derived([{ value: '', name: 'Ungrouped' }, ...toItems(data.categories)]);
	const pillarItems = $derived([
		{ value: '', name: 'Any programme' },
		...toItems(data.pillarOptions)
	]);

	const fields: CrudField[] = $derived([
		{ name: 'name', label: 'What they can ask for', required: true },
		{ name: 'slug', label: 'Slug', required: true, placeholder: 'school-fees' },
		{ name: 'categoryId', label: 'Shown under', type: 'select', items: categoryItems },
		{
			name: 'pillarId',
			label: 'Routes to programme',
			type: 'select',
			items: pillarItems,
			placeholder: 'An application naming this need is filed against that programme'
		},
		{ name: 'description', label: 'Shown under it on the form', type: 'textarea', rows: 2 },
		{
			name: 'evidenceHint',
			label: 'Evidence that usually helps',
			placeholder: 'A prescription or a photograph of one'
		},
		{ name: 'isActive', label: 'Offered on the form', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	]);

	const keys = [
		'name',
		'slug',
		'categoryId',
		'pillarId',
		'description',
		'evidenceHint',
		'isActive',
		'sortOrder'
	];

	const nameOf = (rows: { id: number; name: string }[], id: number | null, fallback: string) =>
		rows.find((row) => row.id === id)?.name ?? fallback;

	const columns = $derived([
		indexColumn,
		column('name', 'Kind of help'),
		{
			accessorKey: 'categoryId',
			header: 'Group',
			cell: ({ row }: any) => nameOf(data.categories, row.original.categoryId, 'Ungrouped')
		},
		{
			accessorKey: 'pillarId',
			header: 'Routes to',
			cell: ({ row }: any) => nameOf(data.pillarOptions, row.original.pillarId, 'Any')
		},
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit kind of help', keys }),
		deleteColumn(data.deleteForm, 'name')
	]);
</script>

<ContentPage
	title="Kinds of help"
	description="What someone can tick on the apply form. Each one can name the programme it routes to, so an applicant never has to know which of the four owns their problem — and because these are rows, 'how many families asked for school fees this term' is a question the applications list can answer."
	addTitle="Add kind of help"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
