<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import { column, deleteColumn, editColumn, indexColumn } from '$lib/dashboard/columns';
	import { yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const days = [
		{ value: '', name: 'No fixed day' },
		{ value: '0', name: 'Sunday' },
		{ value: '1', name: 'Monday' },
		{ value: '2', name: 'Tuesday' },
		{ value: '3', name: 'Wednesday' },
		{ value: '4', name: 'Thursday' },
		{ value: '5', name: 'Friday' },
		{ value: '6', name: 'Saturday' }
	];

	const fields: CrudField[] = [
		{ name: 'label', label: 'Label', required: true, placeholder: 'Morning' },
		{ name: 'slug', label: 'Slug', required: true, placeholder: 'saturday-morning' },
		{ name: 'dayOfWeek', label: 'Day', type: 'select', items: days },
		{ name: 'startTime', label: 'Starts (HH:MM)', placeholder: '08:00' },
		{ name: 'endTime', label: 'Ends (HH:MM)', placeholder: '12:00' },
		{ name: 'description', label: 'Note shown on hover', type: 'textarea', rows: 2 },
		{ name: 'isActive', label: 'Offered on the form', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = [
		'label',
		'slug',
		'dayOfWeek',
		'startTime',
		'endTime',
		'description',
		'isActive',
		'sortOrder'
	];

	const dayName = (day: number | null) =>
		day === null || day === undefined
			? 'Any day'
			: (days.find((item) => item.value === String(day))?.name ?? '-');

	const columns = [
		indexColumn,
		{
			accessorKey: 'dayOfWeek',
			header: 'Day',
			cell: ({ row }: any) => dayName(row.original.dayOfWeek)
		},
		column('label', 'Label'),
		{
			accessorKey: 'startTime',
			header: 'Hours',
			cell: ({ row }: any) =>
				row.original.startTime && row.original.endTime
					? `${row.original.startTime}–${row.original.endTime}`
					: '-'
		},
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit time slot', keys }),
		deleteColumn(data.deleteForm, 'label')
	];
</script>

<ContentPage
	title="Volunteer time slots"
	description="The windows a volunteer can say they are usually free in. Because availability is stored against these rows rather than typed into a box, 'who can cover Saturday morning?' is a question the volunteer list can answer."
	addTitle="Add time slot"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
