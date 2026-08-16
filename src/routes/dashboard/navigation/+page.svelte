<script lang="ts">
	import ContentPage from '$lib/dashboard/content-page.svelte';
	import { column, deleteColumn, editColumn, indexColumn } from '$lib/dashboard/columns';
	import { toItems, yesNo } from '$lib/dashboard/options';
	import type { CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let { data } = $props();

	const placements = [
		{ value: 'header', name: 'Header only' },
		{ value: 'footer', name: 'Footer only' },
		{ value: 'both', name: 'Header and footer' }
	];

	const pageItems = [
		{ value: '', name: '— none (use a URL instead) —' },
		...toItems(data.pageOptions, 'title')
	];
	const parentItems = [{ value: '', name: '— top level —' }, ...toItems(data.navOptions, 'label')];

	const fields: CrudField[] = [
		{ name: 'label', label: 'Label (English)', required: true },
		{ name: 'pageId', label: 'Links to page', type: 'combo', items: pageItems },
		{ name: 'url', label: 'Or an external URL / anchor', placeholder: 'https://… or #section' },
		{ name: 'placement', label: 'Where it appears', type: 'select', items: placements },
		{ name: 'parentId', label: 'Nested under', type: 'combo', items: parentItems },
		{ name: 'isCta', label: 'Render as a button', type: 'select', items: yesNo },
		{ name: 'isVisible', label: 'Visible', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	];

	const keys = [
		'label',
		'pageId',
		'url',
		'placement',
		'parentId',
		'isCta',
		'isVisible',
		'sortOrder'
	];

	const columns = [
		indexColumn,
		column('label', 'Label'),
		column('placement', 'Placement'),
		column('url', 'URL'),
		column('sortOrder', 'Order'),
		editColumn({ data: data.editForm, fields, title: 'Edit navigation item', keys }),
		deleteColumn(data.deleteForm, 'label')
	];
</script>

<ContentPage
	title="Navigation"
	description="The header and footer links. A link pointing at an unpublished page is hidden automatically rather than shown and 404ing."
	addTitle="Add link"
	addForm={data.addForm}
	{fields}
	{columns}
	rows={data.rows}
/>
