<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import { Eye, Mail, Phone } from '@lucide/svelte';
	import RowForm from './row-form.svelte';

	/**
	 * The whole of a volunteer, read-only, beside the row.
	 *
	 * The review page used to be where a coordinator read what somebody wrote.
	 * With the workflow in the table there is nowhere else for that to live, and
	 * approving a person whose words you have not read is the one thing this
	 * screen must not quietly encourage. Placements are here too: they are rare,
	 * and gated on the same check as approval.
	 */
	let {
		row,
		pillarOptions
	}: {
		/** The parts of a volunteers-table row this sheet reads. */
		row: {
			id: number;
			reference: string;
			fullName: string;
			email: string | null;
			phone: string | null;
			regionName: string | null;
			motivation: string | null;
			availability: string | null;
			credentials: string | null;
			canApprove: boolean;
			placementRows: {
				id: number;
				pillarName: string | null;
				roleDescription: string | null;
			}[];
		};
		pillarOptions: { id: number; name: string }[];
	} = $props();

	const pillarItems = $derived(
		pillarOptions.map((pillar) => ({ value: String(pillar.id), name: pillar.name }))
	);

	let pillarId: string | undefined = $state(undefined);
	let pillarField: HTMLInputElement;
</script>

<Sheet.Root>
	<Sheet.Trigger>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon" class="size-8" aria-label="Open">
				<Eye class="size-4" />
			</Button>
		{/snippet}
	</Sheet.Trigger>

	<Sheet.Content side="right" class="w-full overflow-y-auto sm:max-w-lg">
		<Sheet.Header>
			<Sheet.Title>{row.fullName}</Sheet.Title>
			<Sheet.Description>
				<span class="font-mono">{row.reference}</span>
				{row.regionName ? ` · ${row.regionName}` : ''}
			</Sheet.Description>
		</Sheet.Header>

		<div class="flex flex-col gap-5 px-4 pb-6">
			<div class="flex flex-wrap gap-3 text-sm">
				{#if row.phone}
					<a
						href="tel:{row.phone}"
						class="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
					>
						<Phone class="size-4" />{row.phone}
					</a>
				{/if}
				{#if row.email}
					<a
						href="mailto:{row.email}"
						class="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
					>
						<Mail class="size-4" />{row.email}
					</a>
				{/if}
			</div>

			{#if row.motivation}
				<div>
					<h3 class="mb-1 text-sm font-medium">Why they want to help</h3>
					<p class="text-sm whitespace-pre-line text-muted-foreground">{row.motivation}</p>
				</div>
			{/if}

			{#if row.availability}
				<div>
					<h3 class="mb-1 text-sm font-medium">Availability</h3>
					<p class="text-sm text-muted-foreground">{row.availability}</p>
				</div>
			{/if}

			{#if row.credentials}
				<div>
					<h3 class="mb-1 text-sm font-medium">Credentials</h3>
					<p class="text-sm whitespace-pre-line text-muted-foreground">{row.credentials}</p>
				</div>
			{/if}

			<div>
				<h3 class="mb-2 text-sm font-medium">Placements</h3>
				{#if row.placementRows.length}
					<div class="mb-2 flex flex-col gap-1">
						{#each row.placementRows as placement (placement.id)}
							<div class="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
								<span>{placement.pillarName ?? 'No programme'}</span>
								<Badge variant="outline" class="text-[10px]">
									{placement.roleDescription ?? 'Volunteer'}
								</Badge>
							</div>
						{/each}
					</div>
				{/if}

				{#if row.canApprove}
					<RowForm action="?/addPlacement" id={row.id} class="flex flex-col gap-2">
						<input type="hidden" name="pillarId" bind:this={pillarField} value="" />
						<SelectComp
							name="pillarChoice"
							bind:value={pillarId}
							items={pillarItems}
							searchable={false}
							placeholder="Which programme?"
							triggerClass="h-8 w-full text-xs normal-case"
							onValueChange={(value: string) => (pillarField.value = value)}
						/>
						<Input name="roleDescription" placeholder="What they will do" class="h-8 text-xs" />
						<Button type="submit" size="sm" variant="outline">Place them</Button>
					</RowForm>
				{:else}
					<p class="text-xs text-muted-foreground">
						Placement stays shut until safeguarding is complete and any licence is verified — the
						same gate as approval, and the more important of the two, because a placement is the
						moment a volunteer meets somebody.
					</p>
				{/if}
			</div>

			<div class="flex flex-wrap gap-2 border-t pt-4">
				<a
					href="/dashboard/volunteers/{row.id}"
					class={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					Their form
				</a>
				<a
					href="/dashboard/volunteers/{row.id}/details"
					class={buttonVariants({ variant: 'outline', size: 'sm' })}
				>
					Fill in their details
				</a>
			</div>
		</div>
	</Sheet.Content>
</Sheet.Root>
