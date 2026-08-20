<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import { column, deleteColumn, editColumn, indexColumn } from '$lib/dashboard/columns';
	import { toItems, yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const staffItems = $derived([{ value: '', name: 'Nobody' }, ...toItems(data.staff)]);
	const pillarItems = $derived([{ value: '', name: 'None' }, ...toItems(data.pillarOptions)]);

	const fields: CrudField[] = $derived([
		{ name: 'name', label: 'Topic', required: true },
		{ name: 'slug', label: 'Slug', required: true, placeholder: 'press' },
		{ name: 'description', label: 'Shown under the option on the form', type: 'textarea', rows: 2 },
		{ name: 'icon', label: 'Icon', placeholder: 'Newspaper' },
		{
			name: 'notifyEmails',
			label: 'Email these people, one per line',
			type: 'textarea',
			rows: 3,
			placeholder: 'Leave blank to use the primary contact address'
		},
		{ name: 'defaultAssigneeId', label: 'Lands in this queue', type: 'select', items: staffItems },
		{
			name: 'targetResponseHours',
			label: 'Answer within (hours)',
			type: 'number',
			placeholder: 'Blank means no target'
		},
		{
			name: 'publicResponseNote',
			label: 'What the sender is told to expect',
			placeholder: 'We usually reply within three working days.'
		},
		{
			name: 'suggestedPillarId',
			label: 'Really an application for',
			type: 'select',
			items: pillarItems,
			placeholder: 'Shows a pointer to that programme instead'
		},
		{ name: 'isActive', label: 'Offered on the form', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	]);

	const keys = [
		'name',
		'slug',
		'description',
		'icon',
		'notifyEmails',
		'defaultAssigneeId',
		'targetResponseHours',
		'publicResponseNote',
		'suggestedPillarId',
		'isActive',
		'sortOrder'
	];

	const staffName = (id: string | null) =>
		data.staff.find((row) => row.id === id)?.name ?? 'General inbox';

	const columns = $derived([
		indexColumn,
		column('name', 'Topic'),
		{
			accessorKey: 'notifyEmails',
			header: 'Notifies',
			cell: ({ row }: any) => row.original.notifyEmails?.split('\n')[0] || 'Primary address'
		},
		{
			accessorKey: 'defaultAssigneeId',
			header: 'Queue',
			cell: ({ row }: any) => staffName(row.original.defaultAssigneeId)
		},
		{
			accessorKey: 'targetResponseHours',
			header: 'Target',
			cell: ({ row }: any) =>
				row.original.targetResponseHours ? `${row.original.targetResponseHours}h` : '—'
		},
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit enquiry topic', keys }),
		deleteColumn(data.deleteForm, 'name')
	]);
</script>

<ContentPage
	title="Enquiry topics"
	description="What someone can say their message is about, and where it goes when they do. Each topic carries its own notification list, queue and response target — so redirecting press enquiries to the communications lead is an edit here rather than a code change."
	addTitle="Add topic"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
