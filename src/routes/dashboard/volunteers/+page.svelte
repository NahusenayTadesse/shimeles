<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import DataTable from '$lib/components/Table/data-table.svelte';
	import FilterBar from '$lib/dashboard/filter-bar.svelte';
	import StatusBadge from '$lib/dashboard/status-badge.svelte';
	import BadgeCell from '$lib/dashboard/badge-cell.svelte';
	import OpenLinkCell from '$lib/dashboard/open-link-cell.svelte';
	import SafeguardingCell from './safeguarding-cell.svelte';
	import { column, indexColumn } from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import { ShieldAlert, Stethoscope } from '@lucide/svelte';

	let { data } = $props();

	let search = $state(data.filters.search);

	const fmt = (value: Date | string | null) =>
		value
			? new Intl.DateTimeFormat('en-GB', {
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				}).format(new Date(value))
			: '';

	const blockedCount = $derived(data.rows.filter((row) => !row.safeguardingComplete).length);

	const hasFilters = $derived(
		Boolean(
			data.filters.search ||
			data.filters.statusId ||
			data.filters.blocked ||
			data.filters.skillId ||
			data.filters.slotId ||
			data.filters.professional
		)
	);

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

	const columns = [
		indexColumn,
		column('reference', 'Reference'),
		column('fullName', 'Name'),
		{
			id: 'status',
			header: 'Status',
			cell: ({ row }: any) =>
				renderComponent(StatusBadge, {
					label: row.original.statusLabel,
					color: row.original.statusColor
				})
		},
		{
			id: 'safeguarding',
			header: 'Safeguarding',
			cell: ({ row }: any) =>
				renderComponent(SafeguardingCell, { complete: row.original.safeguardingComplete })
		},
		{
			id: 'professional',
			header: 'Professional',
			enableSorting: false,
			cell: ({ row }: any) =>
				row.original.credentials
					? renderComponent(BadgeCell, {
							label: row.original.credentialsVerified ? 'Verified' : 'Unverified',
							variant: row.original.credentialsVerified ? 'outline' : 'destructive'
						})
					: '—'
		},
		{
			id: 'createdAt',
			header: 'Applied',
			cell: ({ row }: any) => fmt(row.original.createdAt)
		},
		{
			id: 'actions',
			header: '',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(OpenLinkCell, { href: `/dashboard/volunteers/${row.original.id}` })
		}
	];
</script>

<svelte:head><title>Volunteers · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="font-heading text-2xl font-bold">Volunteers</h1>
		<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
			Every volunteer application. Approval is blocked — on the server, not just in this interface —
			until the safeguarding checklist is complete.
		</p>
	</div>

	<FilterBar bind:search placeholder="Name, reference, email or phone…" {hasFilters}>
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

	{#key data.rows}
		<DataTable {columns} data={data.rows} search={false} fileName="Volunteers" />
	{/key}
</div>
