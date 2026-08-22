<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Lock } from '@lucide/svelte';

	let { data } = $props();

	/**
	 * Permissions grouped, so a long flat list does not have to be read linearly.
	 * A plain object rather than a Map: this runs inside the template and its
	 * result is never mutated afterwards, so reactivity has nothing to track.
	 */
	function grouped(items: { permission: string; description: string | null; group: string }[]) {
		const groups: Record<string, typeof items> = {};
		for (const item of items) (groups[item.group] ??= []).push(item);
		return Object.entries(groups);
	}
</script>

<svelte:head><title>Roles · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="font-heading text-2xl font-bold">Roles</h1>
		<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
			What each role can reach. Assign a role to somebody on the Users screen.
		</p>
	</div>

	<Alert.Root>
		<Lock class="size-4" />
		<Alert.Title>These are set in code, on purpose</Alert.Title>
		<Alert.Description>
			Almost everything else in this system is editable from the dashboard. Permission sets are the
			deliberate exception: they are an access-control decision, and this system holds medical and
			mental-health-adjacent data. Changing one is a developer task with a migration behind it.
		</Alert.Description>
	</Alert.Root>

	<div class="grid gap-4 md:grid-cols-2">
		{#each data.roles as role (role.id)}
			<Card.Root class="p-5">
				<div class="mb-3 flex items-start justify-between gap-2">
					<div>
						<h2 class="font-heading text-lg font-semibold">{role.name}</h2>
						{#if role.description}
							<p class="mt-1 text-sm text-muted-foreground">{role.description}</p>
						{/if}
					</div>
					<Badge variant="secondary"
						>{role.userCount} {role.userCount === 1 ? 'user' : 'users'}</Badge
					>
				</div>

				<p class="mb-3 font-mono text-[11px] text-muted-foreground">{role.slug}</p>

				<div class="flex flex-col gap-3">
					{#each grouped(role.permissions) as [group, items] (group)}
						<div>
							<p class="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
								{group}
							</p>
							<ul class="flex flex-col gap-1 text-sm">
								{#each items as item (item.permission)}
									<li class="text-muted-foreground">
										{item.description ?? item.permission}
									</li>
								{/each}
							</ul>
						</div>
					{:else}
						<p class="text-sm text-muted-foreground">No permissions granted.</p>
					{/each}
				</div>

				{#if role.slug === 'program_staff'}
					<p class="mt-4 border-t pt-3 text-xs text-muted-foreground">
						Scoped further by programme assignment: a program staff member sees only the programmes
						ticked for them on the Users screen, and none by default.
					</p>
				{/if}
			</Card.Root>
		{/each}
	</div>
</div>
