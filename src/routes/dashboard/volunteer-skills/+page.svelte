<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import { column, deleteColumn, editColumn, indexColumn } from '$lib/dashboard/columns';
	import { toItems, yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const categoryItems = $derived(toItems(data.categories));

	const fields: CrudField[] = $derived([
		{ name: 'name', label: 'Skill', required: true },
		{ name: 'slug', label: 'Slug', required: true, placeholder: 'hospital-companionship' },
		{ name: 'categoryId', label: 'Group it appears under', type: 'select', items: categoryItems },
		{
			name: 'hint',
			label: 'Hint shown under it on the form',
			placeholder: 'Company during long hospital stays, including overnight.'
		},
		{ name: 'description', label: 'Internal note', type: 'textarea', rows: 2 },
		{
			name: 'requiresCredential',
			label: 'Needs a professional licence',
			type: 'select',
			items: yesNo,
			placeholder: 'Ticking this on the form forces the applicant to enter a licence'
		},
		{ name: 'isActive', label: 'Offered on the form', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	]);

	const keys = [
		'name',
		'slug',
		'categoryId',
		'hint',
		'description',
		'requiresCredential',
		'isActive',
		'sortOrder'
	];

	const categoryName = (id: number | null) =>
		data.categories.find((category) => category.id === id)?.name ?? '—';

	const columns = $derived([
		indexColumn,
		column('name', 'Skill'),
		{
			accessorKey: 'categoryId',
			header: 'Group',
			cell: ({ row }: any) => categoryName(row.original.categoryId)
		},
		{
			accessorKey: 'requiresCredential',
			header: 'Licence',
			cell: ({ row }: any) => (row.original.requiresCredential ? 'Required' : '—')
		},
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit skill', keys }),
		deleteColumn(data.deleteForm, 'name')
	]);
</script>

<ContentPage
	title="Volunteer skills"
	description="What a volunteer can tick on the public form. Every skill here is a filter on the volunteer list — adding one makes it answerable, and a skill marked as needing a licence sends whoever claims it through credential verification before they can be placed."
	addTitle="Add skill"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
