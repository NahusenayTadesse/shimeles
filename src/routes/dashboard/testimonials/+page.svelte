<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import {
		column,
		deleteColumn,
		editColumn,
		imageColumn,
		indexColumn,
		longColumn
	} from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import RowLink from '$lib/dashboard/row-link.svelte';
	import { toItems, yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const pillarItems = $derived([
		{ value: '', name: 'No programme' },
		...toItems(data.pillarOptions)
	]);

	const fields: CrudField[] = $derived([
		{ name: 'name', label: 'Name', required: true, placeholder: 'Meron' },
		{ name: 'slug', label: 'URL slug', required: true, placeholder: 'meron-k' },
		{ name: 'role', label: 'Who they are', placeholder: 'Parent, Kolfe' },
		{
			name: 'quote',
			label: 'The quote (shown on cards and in the slider)',
			type: 'textarea',
			rows: 3,
			required: true
		},
		{ name: 'body', label: 'Their fuller story (optional)', type: 'richtext' },
		{ name: 'photo', label: 'Photo', type: 'file' },
		{ name: 'pillarId', label: 'Programme', type: 'select', items: pillarItems },
		{ name: 'showOnSite', label: 'Show on the testimonials page', type: 'select', items: yesNo },
		{ name: 'isFeatured', label: 'Feature in the homepage slider', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	]);

	const keys = [
		'name',
		'slug',
		'role',
		'quote',
		'body',
		'pillarId',
		'showOnSite',
		'isFeatured',
		'sortOrder'
	];

	const columns = $derived([
		indexColumn,
		column('name', 'Name'),
		column('role', 'Who they are'),
		imageColumn('photo', 'Photo'),
		longColumn('quote', 'Quote'),
		column('showOnSite', 'On the wall'),
		column('isFeatured', 'In the slider'),
		{
			id: 'media',
			header: 'Photos & video',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(RowLink, {
					href: `/dashboard/media/testimonial/${row.original.id}`,
					label: 'Photos & video'
				})
		},
		column('sortOrder', 'Order'),
		editColumn({
			data: data.editForm,
			fields,
			title: 'Edit testimonial',
			keys,
			fileKeys: ['photo']
		}),
		deleteColumn(data.deleteForm, 'name')
	]);
</script>

<ContentPage
	title="Testimonials"
	description="What the families, elders, students and volunteers say. 'On the wall' puts a quote on the public testimonials page; 'in the slider' also puts it on the homepage."
	addTitle="Add testimonial"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
