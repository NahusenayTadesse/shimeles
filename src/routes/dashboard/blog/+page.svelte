<script lang="ts">
	import DataTable from '$lib/components/Table/data-table.svelte';
	import CrudDialog, { type CrudField } from '$lib/components/Table/crud-dialog.svelte';
	import FilterBar from '$lib/dashboard/filter-bar.svelte';
	import DateRange from '$lib/dashboard/date-range.svelte';
	import Pager from '$lib/dashboard/pager.svelte';
	import ServerSort from '$lib/dashboard/server-sort.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		deleteColumn,
		editColumn,
		imageColumn,
		indexColumn,
		longColumn
	} from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import RowLink from '$lib/dashboard/row-link.svelte';
	import { toItems, yesNo } from '$lib/dashboard/options';
	import { applyFilter } from '$lib/dashboard/apply-filter';
	import { page as pageState } from '$app/state';

	let { data } = $props();

	let search = $state(data.filters.search);

	const categoryItems = $derived([{ value: '', name: 'No category' }, ...toItems(data.categories)]);

	const fields: CrudField[] = $derived([
		{ name: 'title', label: 'Title', required: true },
		{ name: 'slug', label: 'URL slug', required: true, placeholder: 'a-day-in-kolfe' },
		{ name: 'excerpt', label: 'Excerpt (shown on cards)', type: 'textarea', rows: 3 },
		{ name: 'coverImage', label: 'Cover photo', type: 'file' },
		{ name: 'categoryId', label: 'Category', type: 'select', items: categoryItems },
		{ name: 'authorName', label: 'Author', placeholder: 'Communications team' },
		{ name: 'publishedAt', label: 'Publish date', type: 'date' },
		{ name: 'metaDescription', label: 'Search description', type: 'textarea', rows: 2 },
		{ name: 'readMinutes', label: 'Read time in minutes (0 = work it out)', type: 'number' },
		{ name: 'isFeatured', label: 'Feature at the top of /blog', type: 'select', items: yesNo },
		{ name: 'isPublished', label: 'Published', type: 'select', items: yesNo },
		{ name: 'sortOrder', label: 'Display order', type: 'number' }
	]);

	const keys = [
		'title',
		'slug',
		'excerpt',
		'categoryId',
		'authorName',
		'publishedAt',
		'metaDescription',
		'readMinutes',
		'isFeatured',
		'isPublished',
		'sortOrder'
	];

	/** Named for the chips above the table, so a short archive says why. */
	const activeFilters = $derived(
		[
			data.filters.search && { key: 'q', label: `Matching "${data.filters.search}"` },
			data.filters.category && {
				key: 'category',
				label:
					data.categories.find((category) => String(category.id) === data.filters.category)?.name ??
					'A category'
			},
			data.filters.createdBy && {
				key: 'createdBy',
				label:
					data.creators.find((creator) => creator.id === data.filters.createdBy)?.name ??
					'An author'
			},
			// One control owns both ends of the range, so one chip takes both off.
			(data.filters.from || data.filters.to) && {
				key: ['from', 'to'],
				label: `Published ${data.filters.from ?? 'any time'} to ${data.filters.to ?? 'now'}`
			}
		].filter(Boolean) as { key: string | string[]; label: string }[]
	);

	/** Sorting is a URL parameter, not a client-side reorder — see `ServerSort`. */
	const sortable = (field: string, name: string) => ({
		accessorKey: field,
		enableSorting: false,
		header: () => renderComponent(ServerSort, { name, field, sort: data.sort })
	});

	const columns = $derived([
		indexColumn,
		sortable('title', 'Title'),
		imageColumn('coverImage', 'Cover'),
		{ accessorKey: 'categoryName', header: 'Category', enableSorting: false },
		longColumn('excerpt', 'Excerpt'),
		sortable('publishedAt', 'Published'),
		sortable('isPublished', 'Live'),
		{
			id: 'content',
			header: 'Article',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(RowLink, {
					href: `/dashboard/blog/${row.original.id}`,
					label: 'Write & photos'
				})
		},
		editColumn({
			data: data.editForm,
			fields,
			title: 'Edit post',
			keys,
			fileKeys: ['coverImage']
		}),
		deleteColumn(data.deleteForm, 'title')
	]);
</script>

<svelte:head><title>Blog | Dashboard</title></svelte:head>

<div class="flex flex-col gap-4 p-2">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="font-heading text-2xl font-bold">Blog</h1>
			<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
				Programme updates, field notes and donor stories. This screen holds a post's title, cover
				and category. Use 'Write &amp; photos' to write the article itself and add its gallery.
			</p>
		</div>
		<CrudDialog title="Add post" data={data.addForm} action="?/add" {fields} />
	</div>

	<!-- Filtering and paging happen in SQL, so this screen stays usable however
	     long the archive gets. Everything but the search box is a click. -->
	<FilterBar
		bind:search
		placeholder="Title, excerpt, slug or author…"
		active={activeFilters}
		resetsPage
	>
		{#snippet children({ applyFilter })}
			<DateRange from={data.filters.from} to={data.filters.to} label="Any publish date" />

			{#if data.creators.length > 1}
				{#each data.creators as creator (creator.id)}
					<Button
						variant={data.filters.createdBy === creator.id ? 'default' : 'outline'}
						size="sm"
						onclick={() =>
							applyFilter('createdBy', data.filters.createdBy === creator.id ? null : creator.id)}
					>
						{creator.name}
					</Button>
				{/each}
			{/if}
		{/snippet}
	</FilterBar>

	<!-- Categories get their own row of chips rather than a dropdown: there are
	     a handful of them and picking one should cost a single click. -->
	{#if data.categories.length}
		<div class="flex flex-wrap items-center gap-1">
			<Button
				variant={data.filters.category === '' ? 'default' : 'ghost'}
				size="sm"
				class="h-7 text-xs"
				onclick={() => applyFilter(pageState.url, 'category', null)}
			>
				All categories
			</Button>
			{#each data.categories as category (category.id)}
				<Button
					variant={data.filters.category === String(category.id) ? 'default' : 'ghost'}
					size="sm"
					class="h-7 text-xs"
					onclick={() =>
						applyFilter(
							pageState.url,
							'category',
							data.filters.category === String(category.id) ? null : String(category.id)
						)}
				>
					{category.name}
				</Button>
			{/each}
		</div>
	{/if}

	{#key data.rows}
		<DataTable
			{columns}
			data={data.rows}
			search={false}
			serverSide
			total={data.total}
			fileName="Blog posts"
		/>
	{/key}

	<Pager page={data.page} pageCount={data.pageCount} perPage={data.perPage} total={data.total} />
</div>
