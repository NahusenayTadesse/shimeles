<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';

	let {
		roleSlug,
		pillarIds,
		pillarOptions,
		onOpen
	}: {
		roleSlug: string | null;
		pillarIds: number[];
		pillarOptions: { id: number; name: string }[];
		onOpen: () => void;
	} = $props();

	/** Only pillar-scoped roles need an assignment; the rest see everything. */
	const needsPillars = (slug: string | null) => slug === 'program_staff';
</script>

{#if roleSlug === 'super_admin'}
	<span class="text-xs text-muted-foreground">All programmes</span>
{:else if needsPillars(roleSlug)}
	<button type="button" onclick={onOpen} class="flex flex-wrap gap-1 text-left">
		{#each pillarIds as pillarId (pillarId)}
			<Badge variant="secondary">
				{pillarOptions.find((p) => p.id === pillarId)?.name ?? pillarId}
			</Badge>
		{:else}
			<Badge variant="destructive">None — sees no cases</Badge>
		{/each}
	</button>
{:else}
	<span class="text-xs text-muted-foreground">Not case-scoped</span>
{/if}
