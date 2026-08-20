<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import { column, deleteColumn, editColumn, indexColumn } from '$lib/dashboard/columns';
	import { toItems, yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const pillarItems = $derived([
		{ value: '', name: 'Any programme' },
		...toItems(data.pillarOptions)
	]);

	const fields: CrudField[] = $derived([
		{ name: 'name', label: 'What it is', required: true },
		{ name: 'slug', label: 'Slug', required: true, placeholder: 'winter-clothing' },
		{ name: 'description', label: 'Shown under it on the form', type: 'textarea', rows: 2 },
		{ name: 'icon', label: 'Icon', placeholder: 'Shirt' },
		{ name: 'pillarId', label: 'Usually goes to', type: 'select', items: pillarItems },
		{ name: 'defaultUnit', label: 'Counted in, by default', placeholder: 'boxes' },
		{
			name: 'requiresSizing',
			label: 'Ask about sizes and who it fits',
			type: 'select',
			items: yesNo
		},
		{
			name: 'requiresExpiry',
			label: 'Ask for a use-by date',
			type: 'select',
			items: yesNo
		},
		{
			name: 'requiresTransport',
			label: 'Warn that collecting it needs a vehicle',
			type: 'select',
			items: yesNo
		},
		{
			name: 'acceptanceNote',
			label: 'What we can and cannot take',
			type: 'textarea',
			rows: 2,
			placeholder: 'Sealed, with at least three months before the use-by date.'
		},
		{ name: 'isAcceptingNow', label: 'Accepting these right now', type: 'select', items: yesNo },
		{ name: 'isActive', label: 'Listed on the form', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	]);

	const keys = [
		'name',
		'slug',
		'description',
		'icon',
		'pillarId',
		'defaultUnit',
		'requiresSizing',
		'requiresExpiry',
		'requiresTransport',
		'acceptanceNote',
		'isAcceptingNow',
		'isActive',
		'sortOrder'
	];

	/** The three flags as one column — they are read together or not at all. */
	const asks = (row: Record<string, unknown>) =>
		[
			row.requiresSizing ? 'sizes' : null,
			row.requiresExpiry ? 'use-by' : null,
			row.requiresTransport ? 'transport' : null
		]
			.filter(Boolean)
			.join(', ') || '—';

	const columns = $derived([
		indexColumn,
		column('name', 'Category'),
		{
			accessorKey: 'pillarId',
			header: 'Usually goes to',
			cell: ({ row }: any) =>
				data.pillarOptions.find((pillar) => pillar.id === row.original.pillarId)?.name ?? 'Any'
		},
		column('defaultUnit', 'Unit'),
		{ id: 'asks', header: 'Extra questions', cell: ({ row }: any) => asks(row.original) },
		{
			accessorKey: 'isAcceptingNow',
			header: 'Taking now',
			cell: ({ row }: any) => (row.original.isAcceptingNow ? 'Yes' : 'Paused')
		},
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit gift category', keys }),
		deleteColumn(data.deleteForm, 'name')
	]);
</script>

<ContentPage
	title="Gift categories"
	description="What somebody can offer on the donate page, and the questions each kind of thing brings with it — clothing asks for sizes, food asks for a use-by date, furniture warns that collecting it needs a vehicle. Pausing a category leaves it listed with its note showing, which stops somebody driving across the city with a load we cannot store."
	addTitle="Add gift category"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
