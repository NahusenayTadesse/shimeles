<script lang="ts">
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import RowForm from './row-form.svelte';

	/**
	 * The status picker, in the row.
	 *
	 * Approved stages are dropped from the list while the volunteer is blocked,
	 * rather than offered and refused. The server refuses them either way —
	 * `setVolunteerStatus` is the control and this is a courtesy — but a
	 * coordinator working down a queue should not be invited to try something
	 * that cannot work.
	 */
	let {
		id,
		statusId,
		canApprove,
		statuses
	}: {
		id: number;
		statusId: number | null;
		canApprove: boolean;
		statuses: { id: number; label: string; stage: string | null }[];
	} = $props();

	const items = $derived(
		statuses
			.filter((status) => status.stage !== 'approved' || canApprove)
			.map((status) => ({ value: String(status.id), name: status.label }))
	);

	/**
	 * The posted value is written to this input directly rather than read out of
	 * the combobox's own hidden field. `SelectComp` sets its `value` and calls
	 * `onValueChange` in the same tick, so the field it renders still holds the
	 * previous choice at the moment the form is submitted — posting the status
	 * the coordinator had *before* they picked one.
	 */
	let posted: HTMLInputElement;
</script>

<RowForm action="?/setStatus" {id} class="w-40">
	{#snippet children({ submit })}
		<input
			type="hidden"
			name="statusId"
			bind:this={posted}
			value={statusId ? String(statusId) : ''}
		/>
		<SelectComp
			name="statusChoice"
			value={statusId ? String(statusId) : ''}
			{items}
			searchable={false}
			placeholder="No status"
			triggerClass="h-8 w-full text-xs normal-case"
			onValueChange={(value: string) => {
				posted.value = value;
				// Posts on change: a submit button beside it would be a second
				// click for a decision already made.
				submit();
			}}
		/>
	{/snippet}
</RowForm>
