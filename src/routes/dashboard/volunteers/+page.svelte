<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import DataTable from '$lib/components/Table/data-table.svelte';
	import FilterBar from '$lib/dashboard/filter-bar.svelte';
	import { column, indexColumn } from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import StatusCell from './status-cell.svelte';
	import SafeguardingCell from './safeguarding-cell.svelte';
	import CredentialsCell from './credentials-cell.svelte';
	import ReferencesCell from './references-cell.svelte';
	import ReviewerCell from './reviewer-cell.svelte';
	import VolunteerSheet from './volunteer-sheet.svelte';
	import { ShieldAlert, Stethoscope } from '@lucide/svelte';
	import { formatDate } from '$lib/dates';

	let { data } = $props();

	let search = $state(data.filters.search);

	const fmt = (value: Date | string | null) => formatDate(value, '');

	const blockedCount = $derived(data.rows.filter((row) => !row.safeguardingComplete).length);

	const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	const skillItems = $derived([
		{ value: '', name: 'Any skill' },
		...data.skillOptions.map((skill) => ({ value: String(skill.id), name: skill.name }))
	]);

	const slotItems = $derived([
		{ value: '', name: 'Any time' },
		...data.slotOptions.map((slot) => ({
			value: String(slot.id),
			name: slot.dayOfWeek === null ? slot.label : `${DAY_NAMES[slot.dayOfWeek]} ${slot.label}`
		}))
	]);

	const statusItems = $derived(
		data.statuses.map((status) => ({ value: String(status.id), name: status.label }))
	);

	/** Named for the chips above the table, so a near-empty list says why. */
	const activeFilters = $derived(
		[
			data.filters.search && { key: 'q', label: `Matching "${data.filters.search}"` },
			data.filters.statusId && {
				key: 'status',
				label:
					data.statuses.find((status) => String(status.id) === data.filters.statusId)?.label ??
					'A status'
			},
			data.filters.blocked && { key: 'blocked', label: 'Safeguarding incomplete' },
			data.filters.skillId && {
				key: 'skill',
				label:
					data.skillOptions.find((skill) => String(skill.id) === data.filters.skillId)?.name ??
					'A skill'
			},
			data.filters.slotId && {
				key: 'slot',
				label: slotItems.find((slot) => slot.value === data.filters.slotId)?.name ?? 'A time slot'
			},
			data.filters.professional && { key: 'professional', label: 'Licensed professionals' }
		].filter(Boolean) as { key: string; label: string }[]
	);

	const reviewerItems = $derived([
		{ value: '', name: 'Unassigned' },
		...data.reviewers.map((row) => ({ value: row.id, name: row.name }))
	]);

	/**
	 * Every control a coordinator needs, in the row.
	 *
	 * The status, the checklist, the licences, the references and the reviewer
	 * are all editable here; the eye opens what the volunteer actually wrote.
	 * Nothing about the approval gate moved with them — `setVolunteerStatus`
	 * refuses an approved stage exactly as it did when this was a page.
	 */
	const columns = $derived([
		indexColumn,
		column('reference', 'Reference'),
		column('fullName', 'Name'),
		{
			/*
			 * An accessor beside the component, on every row control below.
			 *
			 * The cell renders a picker, which is why these columns were declared
			 * with an id and nothing else — and an id with no accessor is a column
			 * TanStack cannot sort and cannot build a filter from. So each one now
			 * says what its row is *worth* as plain text: the status label, whether
			 * the checklist is done, whether the licences are verified. The cell is
			 * unchanged; the table simply knows what it is looking at.
			 */
			id: 'status',
			header: 'Status',
			accessorFn: (row: any) => row.statusLabel ?? 'No status',
			cell: ({ row }: any) =>
				renderComponent(StatusCell, {
					id: row.original.id,
					statusId: row.original.statusId,
					canApprove: row.original.canApprove,
					statuses: data.statuses
				})
		},
		{
			id: 'safeguarding',
			header: 'Safeguarding',
			// Complete or not, rather than "3/6": the question anybody sorts or
			// filters this column to answer is which volunteers are blocked.
			accessorFn: (row: any) => (row.safeguardingComplete ? 'Complete' : 'Incomplete'),
			cell: ({ row }: any) =>
				renderComponent(SafeguardingCell, {
					id: row.original.id,
					complete: row.original.safeguardingComplete,
					done: row.original.checksDone,
					total: row.original.checksTotal,
					checklist: row.original.checklist
				})
		},
		{
			id: 'licences',
			header: 'Licences',
			accessorFn: (row: any) =>
				!row.credentialRows?.length
					? 'None claimed'
					: row.credentialsVerified
						? 'Verified'
						: 'Unverified',
			cell: ({ row }: any) =>
				renderComponent(CredentialsCell, {
					id: row.original.id,
					verified: row.original.credentialsVerified,
					credentials: row.original.credentialRows
				})
		},
		{
			id: 'references',
			header: 'References',
			accessorFn: (row: any) =>
				!row.referenceRows?.length
					? 'None given'
					: row.referencesChecked
						? 'Checked'
						: 'Not checked',
			cell: ({ row }: any) =>
				renderComponent(ReferencesCell, {
					id: row.original.id,
					checked: row.original.referencesChecked,
					references: row.original.referenceRows
				})
		},
		{
			id: 'reviewer',
			header: 'Reviewer',
			accessorFn: (row: any) => row.reviewerName ?? 'Unassigned',
			cell: ({ row }: any) =>
				renderComponent(ReviewerCell, {
					id: row.original.id,
					reviewerId: row.original.reviewerId,
					reviewers: data.reviewers
				})
		},
		{
			id: 'createdAt',
			header: 'Applied',
			// The raw timestamp sorts; the cell still shows the short date. Sorting
			// on the formatted string would order "15 Aug" before "2 Sep".
			accessorFn: (row: any) => new Date(row.createdAt ?? 0).getTime(),
			cell: ({ row }: any) => fmt(row.original.createdAt)
		},
		{
			id: 'open',
			header: '',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(VolunteerSheet, {
					row: row.original,
					pillarOptions: data.pillarOptions
				})
		}
	]);

	/* --- The selection ---------------------------------------------------- */

	let bulkStatusField: HTMLInputElement;
	let bulkReviewerField: HTMLInputElement;

	/**
	 * A bulk post reports what it could not do. `bulkStatus` calls the gated
	 * transition once per volunteer, so a selection of twelve can come back as
	 * ten moved and two refused — and the two have to be named, or "it said
	 * done" hides them.
	 */
	const bulkResult = () => {
		return async ({ result, update }: any) => {
			if (result.type === 'failure') {
				toast.error(String(result.data?.error ?? 'That did not work.'));
				return;
			}
			if (result.type === 'success' && result.data?.message) {
				const skipped = (result.data.skipped ?? []) as string[];
				if (skipped.length) toast.warning(String(result.data.message));
				else toast.success(String(result.data.message));
			}
			await update({ reset: false });
		};
	};
</script>

<svelte:head><title>Volunteers · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="font-heading text-2xl font-bold">Volunteers</h1>
		<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
			Everything about a volunteer is editable in the row: the status, the safeguarding checklist,
			their licences, their references and who is reviewing them. Approval stays blocked, on the
			server and not just in this interface, until the checklist is complete.
		</p>
	</div>

	<FilterBar bind:search placeholder="Name, reference, email or phone…" active={activeFilters}>
		{#snippet children({ applyFilter })}
			{#each data.statuses as status (status.id)}
				<Button
					variant={data.filters.statusId === String(status.id) ? 'default' : 'outline'}
					size="sm"
					onclick={() =>
						applyFilter(
							'status',
							data.filters.statusId === String(status.id) ? null : String(status.id)
						)}
				>
					{status.label}
				</Button>
			{/each}

			<Button
				variant={data.filters.blocked ? 'default' : 'outline'}
				size="sm"
				onclick={() => applyFilter('blocked', data.filters.blocked ? null : '1')}
			>
				<ShieldAlert class="size-4" /> Safeguarding incomplete ({blockedCount})
			</Button>

			<Button
				variant={data.filters.professional ? 'default' : 'outline'}
				size="sm"
				onclick={() => applyFilter('professional', data.filters.professional ? null : '1')}
			>
				<Stethoscope class="size-4" /> Licensed professionals
			</Button>

			<!-- The pair of questions the catalogue tables were built to answer:
			     who can do this, and who is free then. -->
			<div class="w-48">
				<SelectComp
					name="skill"
					items={skillItems}
					value={data.filters.skillId ?? ''}
					onValueChange={(value: string) => applyFilter('skill', value || null)}
				/>
			</div>

			<div class="w-44">
				<SelectComp
					name="slot"
					items={slotItems}
					value={data.filters.slotId ?? ''}
					onValueChange={(value: string) => applyFilter('slot', value || null)}
				/>
			</div>
		{/snippet}
	</FilterBar>

	<DataTable
		{columns}
		data={data.rows}
		search={false}
		selectable
		fileName="Volunteers"
		excludeFilters={['status', 'safeguarding']}
		emptyMessage="Applications arrive from the public /volunteer form."
	>
		{#snippet bulkActions({ rows, clear })}
			<!-- Status, reviewer and read/unread only. Ticking safeguarding checks
			     across a selection is deliberately not offered: one click that
			     cleared the approval gate for twenty people is the shape of
			     mistake this workflow exists to prevent. -->
			<form
				method="post"
				action="?/bulkStatus"
				use:enhance={() => {
					const handler = bulkResult();
					return async (options: any) => {
						await handler(options);
						clear();
					};
				}}
				class="flex items-center gap-1"
			>
				{#each rows as row (row.id)}
					<input type="hidden" name="ids" value={row.id} />
				{/each}
				<input type="hidden" name="statusId" bind:this={bulkStatusField} value="" />
				<div class="w-40">
					<SelectComp
						name="bulkStatusChoice"
						items={statusItems}
						searchable={false}
						placeholder="Set status…"
						triggerClass="h-8 w-full text-xs normal-case"
						onValueChange={(value: string) => {
							bulkStatusField.value = value;
							bulkStatusField.form?.requestSubmit();
						}}
					/>
				</div>
			</form>

			<form
				method="post"
				action="?/bulkAssign"
				use:enhance={() => {
					const handler = bulkResult();
					return async (options: any) => {
						await handler(options);
						clear();
					};
				}}
				class="flex items-center gap-1"
			>
				{#each rows as row (row.id)}
					<input type="hidden" name="ids" value={row.id} />
				{/each}
				<input type="hidden" name="reviewerId" bind:this={bulkReviewerField} value="" />
				<div class="w-40">
					<SelectComp
						name="bulkReviewerChoice"
						items={reviewerItems}
						searchable={false}
						placeholder="Assign to…"
						triggerClass="h-8 w-full text-xs normal-case"
						onValueChange={(value: string) => {
							bulkReviewerField.value = value;
							bulkReviewerField.form?.requestSubmit();
						}}
					/>
				</div>
			</form>

			<form
				method="post"
				action="?/markRead"
				use:enhance={() => {
					const handler = bulkResult();
					return async (options: any) => {
						await handler(options);
						clear();
					};
				}}
			>
				{#each rows as row (row.id)}
					<input type="hidden" name="ids" value={row.id} />
				{/each}
				<Button type="submit" variant="outline" size="sm">Mark read</Button>
			</form>
		{/snippet}
	</DataTable>
</div>
