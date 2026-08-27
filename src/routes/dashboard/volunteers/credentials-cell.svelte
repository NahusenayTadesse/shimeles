<script lang="ts">
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Stethoscope } from '@lucide/svelte';
	import RowForm from './row-form.svelte';

	/**
	 * Licence verification, in the row.
	 *
	 * Per credential rather than per volunteer, which is the part a single
	 * "verified" toggle would get wrong: somebody may be a verified nurse and an
	 * unverified counsellor, and `credentials_verified` is deliberately
	 * all-or-nothing over the rows underneath. `recomputeCredentials` folds them
	 * back into the column the approval gate reads, so this popover is the only
	 * way that column moves.
	 */
	let {
		id,
		verified,
		credentials
	}: {
		id: number;
		verified: boolean | null;
		credentials: {
			id: number;
			professionName: string | null;
			otherProfession: string | null;
			licenseNumber: string | null;
			licensingBody: string | null;
			expiresOn: string | null;
			verificationStatus: string;
			verificationNote: string | null;
			verifiedByName: string | null;
		}[];
	} = $props();

	const OUTCOMES = [
		{ value: 'verified', label: 'Verified' },
		{ value: 'rejected', label: 'Rejected' },
		{ value: 'expired', label: 'Expired' },
		{ value: 'pending', label: 'Not checked' }
	];

	const name = (credential: { professionName: string | null; otherProfession: string | null }) =>
		credential.professionName ?? credential.otherProfession ?? 'Professional';

	/** A licence whose expiry has passed, whatever its recorded status says. */
	const isExpired = (expiresOn: string | null) =>
		Boolean(expiresOn) && new Date(expiresOn!) < new Date();
</script>

{#if !credentials.length}
	<span class="text-muted-foreground">-</span>
{:else}
	<Popover.Root>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="ghost" size="sm" class="h-8 gap-1.5 px-2">
					<Stethoscope class="size-4" />
					<Badge variant={verified ? 'outline' : 'destructive'} class="text-[10px]">
						{verified ? 'Verified' : 'Unverified'}
					</Badge>
				</Button>
			{/snippet}
		</Popover.Trigger>

		<Popover.Content class="w-96" align="start">
			<p class="mb-1 text-sm font-medium">Licences</p>
			<p class="mb-3 text-xs text-muted-foreground">
				Every licence has to be verified with its issuing body before this volunteer can be
				approved. One unchecked licence blocks the lot.
			</p>

			<div class="flex flex-col gap-3">
				{#each credentials as credential (credential.id)}
					<div class="rounded-lg border p-3">
						<div class="mb-2 flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="text-sm font-medium">{name(credential)}</p>
								<p class="text-xs text-muted-foreground">
									{credential.licenseNumber
										? `Licence ${credential.licenseNumber}`
										: 'No number given'}
									{credential.licensingBody ? ` · ${credential.licensingBody}` : ''}
								</p>
								{#if isExpired(credential.expiresOn)}
									<p class="text-xs text-destructive">
										Expired {credential.expiresOn}
									</p>
								{/if}
								{#if credential.verifiedByName}
									<p class="text-xs text-muted-foreground">
										{credential.verificationStatus} by {credential.verifiedByName}
									</p>
								{/if}
							</div>
						</div>

						<RowForm action="?/verifyCredential" {id} class="flex flex-col gap-2">
							<input type="hidden" name="credentialId" value={credential.id} />
							<Input
								name="note"
								placeholder="What the issuing body said"
								value={credential.verificationNote ?? ''}
								class="h-8 text-xs"
							/>
							<div class="flex flex-wrap gap-1">
								{#each OUTCOMES as outcome (outcome.value)}
									<Button
										type="submit"
										name="status"
										value={outcome.value}
										size="sm"
										variant={credential.verificationStatus === outcome.value
											? 'default'
											: 'outline'}
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
{/if}
