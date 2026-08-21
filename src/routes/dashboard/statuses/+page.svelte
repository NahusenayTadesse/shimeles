<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import { column, deleteColumn, editColumn, indexColumn } from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import StatusBadge, { statusColorItems } from '$lib/dashboard/status-badge.svelte';
	import { yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const contexts = [
		{ value: 'application', name: 'Assistance applications' },
		{ value: 'volunteer', name: 'Volunteer applications' }
	];

	const stages = [
		{ value: 'submitted', name: 'Submitted' },
		{ value: 'under_review', name: 'Under review' },
		{ value: 'verified', name: 'Verified' },
		{ value: 'references_checked', name: 'References checked (volunteers)' },
		{ value: 'credentials_verified', name: 'Credentials verified (volunteers)' },
		{ value: 'approved', name: 'Approved' },
		{ value: 'waitlisted', name: 'Waitlisted (assessed again next round)' },
		{ value: 'active', name: 'Active / receiving support' },
		{ value: 'closed', name: 'Closed' },
		{ value: 'declined', name: 'Declined' }
	];

	const fields: CrudField[] = [
		{ name: 'context', label: 'Applies to', type: 'select', items: contexts, required: true },
		{
			name: 'stage',
			label: 'Underlying stage',
			type: 'select',
			items: stages,
			required: true,
			placeholder: 'Controls workflow rules — pick the closest match'
		},
		{ name: 'label', label: 'Label shown to staff', required: true },
		{ name: 'color', label: 'Badge colour', type: 'select', items: statusColorItems },
		{ name: 'publicDescription', label: 'Description for applicants', type: 'textarea', rows: 2 },
		{ name: 'isDefault', label: 'Default for new records', type: 'select', items: yesNo },
		{ name: 'isActive', label: 'Active', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = [
		'context',
		'stage',
		'label',
		'color',
		'publicDescription',
		'isDefault',
		'isActive',
		'sortOrder'
	];

	const columns = [
		indexColumn,
		column('context', 'Applies to'),
		{
			accessorKey: 'label',
			header: 'Label',
			cell: ({ row }: any) =>
				renderComponent(StatusBadge, { label: row.original.label, color: row.original.color })
		},
		column('stage', 'Stage'),
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit status', keys }),
		deleteColumn(data.deleteForm, 'label')
	];
</script>

<ContentPage
	title="Workflow statuses"
	description="Rename a status, recolour it, or reorder it freely — records store the status, not its label, so nothing breaks. The underlying stage is what workflow rules key off, including the safeguarding gate, so change it only if you know what depends on it."
	addTitle="Add status"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
