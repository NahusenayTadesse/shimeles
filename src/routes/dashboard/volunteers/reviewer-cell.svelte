<script lang="ts">
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import RowForm from './row-form.svelte';

	/** Who is reviewing this application. Same on-change post as the status cell. */
	let {
		id,
		reviewerId,
		reviewers
	}: {
		id: number;
		reviewerId: string | null;
		reviewers: { id: string; name: string }[];
	} = $props();

	const items = $derived([
		{ value: '', name: 'Unassigned' },
		...reviewers.map((row) => ({ value: row.id, name: row.name }))
	]);

	let posted: HTMLInputElement;
</script>

<RowForm action="?/assign" {id} class="w-36">
	{#snippet children({ submit })}
		<input type="hidden" name="reviewerId" bind:this={posted} value={reviewerId ?? ''} />
		<SelectComp
			name="reviewerChoice"
			value={reviewerId ?? ''}
			{items}
			searchable={false}
			placeholder="Unassigned"
			triggerClass="h-8 w-full text-xs normal-case"
			onValueChange={(value: string) => {
				posted.value = value;
				submit();
			}}
		/>
	{/snippet}
</RowForm>
