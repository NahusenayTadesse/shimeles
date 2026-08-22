<script lang="ts">
	import DataTable from '$lib/components/Table/data-table.svelte';
	import CrudDialog, { type CrudField } from '$lib/components/Table/crud-dialog.svelte';

	let {
		title,
		description,
		addTitle,
		addForm,
		fields,
		columns,
		rows,
		emptyMessage = '',
		caseScoped = false
	}: {
		title: string;
		/** One line telling the admin where this content shows up on the site. */
		description: string;
		addTitle: string;
		addForm: any;
		fields: CrudField[];
		columns: any[];
		rows: any[];
		/** Overrides the generic "nothing here yet" sentence under the table. */
		emptyMessage?: string;
		/** Case data, so an empty table may mean "no programme assigned". */
		caseScoped?: boolean;
	} = $props();
</script>

<svelte:head>
	<title>{title} | Dashboard</title>
</svelte:head>

<div class="flex flex-col gap-4 p-2">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="font-heading text-2xl font-bold">{title}</h1>
			<p class="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
		</div>
		<CrudDialog title={addTitle} data={addForm} action="?/add" {fields} />
	</div>

	{#key rows}
		<DataTable
			{columns}
			data={rows}
			search={true}
			fileName={title}
			{caseScoped}
			emptyMessage={emptyMessage ||
				`Nothing has been added yet. Use “${addTitle}” above to create the first one.`}
		/>
	{/key}
</div>
