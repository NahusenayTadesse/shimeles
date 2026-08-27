<script lang="ts">
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { PhoneCall } from '@lucide/svelte';
	import RowForm from './row-form.svelte';

	/**
	 * Reference outcomes, in the row.
	 *
	 * `references_checked` is derived from these rows by `recomputeReferences` —
	 * true only when every reference has come back satisfactory, and false when
	 * there are none at all. The contact details are here too, because the
	 * coordinator recording an outcome is usually the one who just made the
	 * call.
	 */
	let {
		id,
		checked,
		references
	}: {
		id: number;
		checked: boolean;
		references: {
			id: number;
			fullName: string;
			relationship: string | null;
			email: string | null;
			phone: string | null;
			status: string;
			responseNote: string | null;
			contactedByName: string | null;
		}[];
	} = $props();

	const OUTCOMES = [
		{ value: 'contacted', label: 'Contacted' },
		{ value: 'satisfactory', label: 'Satisfactory' },
		{ value: 'unsatisfactory', label: 'Unsatisfactory' },
		{ value: 'unreachable', label: 'Unreachable' },
		{ value: 'pending', label: 'Not called' }
	];

	const satisfactory = $derived(
		references.filter((reference) => reference.status === 'satisfactory').length
	);
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="sm"
				class="h-8 gap-1.5 px-2 {checked ? 'text-success' : ''}"
			>
				<PhoneCall class="size-4" />
				<span class="tabular-nums">{satisfactory}/{references.length || '-'}</span>
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content class="w-96" align="start">
		<p class="mb-1 text-sm font-medium">References</p>
		<p class="mb-3 text-xs text-muted-foreground">
			{#if !references.length}
				None on file yet. An application with no references is not "checked" — send them their form,
				or add the references yourself.
			{:else}
				Both have to come back satisfactory before this counts as checked.
			{/if}
		</p>

		<div class="flex flex-col gap-3">
			{#each references as reference (reference.id)}
				<div class="rounded-lg border p-3">
					<div class="mb-2">
						<p class="text-sm font-medium">
							{reference.fullName}
							{#if reference.status !== 'pending'}
								<Badge
									variant={reference.status === 'satisfactory' ? 'outline' : 'secondary'}
									class="ml-1 text-[10px]"
								>
									{reference.status}
								</Badge>
							{/if}
						</p>
						<p class="text-xs text-muted-foreground">
							{reference.relationship ?? 'Relationship not given'}
						</p>
						<p class="text-xs text-muted-foreground">
							{[reference.phone, reference.email].filter(Boolean).join(' · ') ||
								'No contact details'}
						</p>
						{#if reference.contactedByName}
							<p class="text-xs text-muted-foreground">Called by {reference.contactedByName}</p>
						{/if}
					</div>

					<RowForm action="?/setReference" {id} class="flex flex-col gap-2">
						<input type="hidden" name="referenceId" value={reference.id} />
						<Input
							name="note"
							placeholder="What they said"
							value={reference.responseNote ?? ''}
							class="h-8 text-xs"
						/>
						<div class="flex flex-wrap gap-1">
							{#each OUTCOMES as outcome (outcome.value)}
								<Button
									type="submit"
									name="status"
									value={outcome.value}
									size="sm"
									variant={reference.status === outcome.value ? 'default' : 'outline'}
									class="h-7 px-2 text-xs"
								>
									{outcome.label}
								</Button>
							{/each}
						</div>
					</RowForm>
				</div>
			{/each}
		</div>
	</Popover.Content>
</Popover.Root>
