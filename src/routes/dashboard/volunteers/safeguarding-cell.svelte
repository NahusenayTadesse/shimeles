<script lang="ts">
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { ShieldAlert, ShieldCheck } from '@lucide/svelte';
	import RowForm from './row-form.svelte';

	/**
	 * The safeguarding checklist, in the row.
	 *
	 * This is the gate §3.6 is built around, and it used to be a page away. The
	 * badge says where the volunteer stands; the popover behind it is the
	 * checklist itself, so completing somebody's checks and then approving them
	 * is two clicks in the same row rather than a round trip.
	 *
	 * Ticking a box posts one check and re-runs the page load, which is what
	 * makes the status picker beside it gain its approved options the moment the
	 * last box is ticked. `recomputeSafeguarding` remains the only writer of
	 * `safeguarding_checklist_complete`.
	 */
	let {
		id,
		complete,
		done,
		total,
		checklist
	}: {
		id: number;
		complete: boolean;
		done: number;
		total: number;
		checklist: {
			id: number;
			label: string;
			description: string | null;
			professionalOnly: boolean;
			done: { completedAt: Date | null; byName: string | null } | null;
		}[];
	} = $props();
</script>

<Popover.Root>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="sm"
				class="h-8 gap-1.5 px-2 {complete ? 'text-success' : 'text-warning'}"
			>
				{#if complete}
					<ShieldCheck class="size-4" />
				{:else}
					<ShieldAlert class="size-4" />
				{/if}
				<span class="tabular-nums">{done}/{total}</span>
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content class="w-80" align="start">
		<p class="mb-1 text-sm font-medium">Safeguarding checklist</p>
		<p class="mb-3 text-xs text-muted-foreground">
			{#if complete}
				Every check is complete. This volunteer can be approved and placed.
			{:else}
				Approval and placement stay shut until all of these are ticked.
			{/if}
		</p>

		{#if total === 0}
			<p class="text-xs text-muted-foreground">
				No safeguarding checks have been set up. Add them under Configuration → Safeguarding
				checklist — without any, nobody can be approved.
			</p>
		{/if}

		<div class="flex flex-col gap-1">
			{#each checklist as item (item.id)}
				<RowForm action="?/toggleCheck" {id}>
					<input type="hidden" name="itemId" value={item.id} />
					<button
						type="submit"
						class="flex w-full items-start gap-2.5 rounded-md p-2 text-left hover:bg-muted"
					>
						<Checkbox
							checked={Boolean(item.done)}
							tabindex={-1}
							class="pointer-events-none mt-0.5"
						/>
						<span class="min-w-0">
							<span class="block text-sm">{item.label}</span>
							{#if item.done?.byName}
								<span class="block text-xs text-muted-foreground">
									Ticked by {item.done.byName}
								</span>
							{:else if item.description}
								<span class="block text-xs text-muted-foreground">{item.description}</span>
							{/if}
						</span>
					</button>
				</RowForm>
			{/each}
		</div>
	</Popover.Content>
</Popover.Root>
