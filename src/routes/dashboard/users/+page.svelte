<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import SelectComp from '$lib/formComponents/SelectComp.svelte';
	import DataTable from '$lib/components/Table/data-table.svelte';
	import RoleSelect from './role-select.svelte';
	import PillarAccessCell from './pillar-access-cell.svelte';
	import BanToggle from './ban-toggle.svelte';
	import UserNameCell from './user-name-cell.svelte';
	import { indexColumn } from '$lib/dashboard/columns';
	import { renderComponent } from '$lib/components/ui/data-table/index.js';
	import { Info, Plus, UserPlus } from '@lucide/svelte';
	import { formatDate } from '$lib/dates';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) toast.error(form.error);
		else if (form?.ok) toast.success('Saved');
	});

	let adding = $state(false);
	let editingPillars = $state<string | null>(null);

	const roleItems = $derived(
		data.roleOptions.map((role) => ({ value: String(role.id), name: role.name }))
	);

	const editingUser = $derived(data.rows.find((row) => row.id === editingPillars));

	const fmt = (value: Date | string | null) => formatDate(value, '');

	const columns = $derived([
		indexColumn,
		{
			id: 'name',
			header: 'Name',
			cell: ({ row }: any) =>
				renderComponent(UserNameCell, { name: row.original.name, banned: row.original.banned })
		},
		{
			id: 'email',
			header: 'Email',
			cell: ({ row }: any) => row.original.email
		},
		{
			id: 'role',
			header: 'Role',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(RoleSelect, {
					userId: row.original.id,
					roleId: row.original.roleId,
					roleItems
				})
		},
		{
			id: 'pillars',
			header: 'Programmes',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(PillarAccessCell, {
					roleSlug: row.original.roleSlug,
					pillarIds: row.original.pillarIds,
					pillarOptions: data.pillarOptions,
					onOpen: () => (editingPillars = row.original.id)
				})
		},
		{
			id: 'createdAt',
			header: 'Added',
			cell: ({ row }: any) => fmt(row.original.createdAt)
		},
		{
			id: 'actions',
			header: '',
			enableSorting: false,
			cell: ({ row }: any) =>
				renderComponent(BanToggle, { userId: row.original.id, banned: row.original.banned })
		}
	]);
</script>

<svelte:head><title>Users · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="font-heading text-2xl font-bold">Users</h1>
			<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
				Who has an account and what they can reach. A programme assignment is what actually decides
				which case files somebody can open.
			</p>
		</div>
		<Button onclick={() => (adding = true)}>
			<Plus class="size-4" /> Add user
		</Button>
	</div>

	<Alert.Root>
		<Info class="size-4" />
		<Alert.Description>
			Roles and what each role can do are set in code, not here — that is an access-control decision
			rather than a content one. This screen decides who holds which role.
		</Alert.Description>
	</Alert.Root>

	{#key data.rows}
		<DataTable {columns} data={data.rows} fileName="Users" />
	{/key}
</div>

<!-- Add user -->
<Dialog.Root bind:open={adding}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Add a user</Dialog.Title>
			<Dialog.Description>
				They will sign in with this email and password. Ask them to change the password once they
				are in.
			</Dialog.Description>
		</Dialog.Header>

		<form
			method="post"
			action="?/create"
			use:enhance={() =>
				async ({ update, result }) => {
					await update({ reset: true });
					if (result.type === 'success') adding = false;
				}}
			class="flex flex-col gap-4"
		>
			<div class="flex flex-col gap-2">
				<Label for="name">Name</Label>
				<Input id="name" name="name" required />
			</div>
			<div class="flex flex-col gap-2">
				<Label for="email">Email</Label>
				<Input id="email" name="email" type="email" required />
			</div>
			<div class="flex flex-col gap-2">
				<Label for="password">Temporary password</Label>
				<Input id="password" name="password" type="password" required minlength={12} />
				<p class="text-xs text-muted-foreground">At least 12 characters.</p>
			</div>
			<div class="flex flex-col gap-2">
				<Label>Role</Label>
				<SelectComp name="roleId" items={roleItems} value={String(data.roleOptions[0]?.id ?? '')} />
			</div>

			<Button type="submit">
				<UserPlus class="size-4" /> Create account
			</Button>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Pillar assignment -->
<Dialog.Root
	open={editingPillars !== null}
	onOpenChange={(open) => !open && (editingPillars = null)}
>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title>Programme access</Dialog.Title>
			<Dialog.Description>
				{editingUser?.name} can open case files for the programmes ticked below, and no others. This is
				enforced on every query, not just hidden in the interface.
			</Dialog.Description>
		</Dialog.Header>

		{#if editingUser}
			<form
				method="post"
				action="?/setPillars"
				use:enhance={() =>
					async ({ update, result }) => {
						await update({ reset: false });
						if (result.type === 'success') editingPillars = null;
					}}
				class="flex flex-col gap-4"
			>
				<input type="hidden" name="userId" value={editingUser.id} />

				<div class="flex flex-col gap-2">
					{#each data.pillarOptions as pillar (pillar.id)}
						<label class="flex items-center gap-2 rounded-lg border p-3 text-sm">
							<Checkbox
								name="pillarIds"
								value={String(pillar.id)}
								checked={editingUser.pillarIds.includes(pillar.id)}
							/>
							{pillar.name}
						</label>
					{/each}
				</div>

				<Separator />

				<p class="text-xs text-muted-foreground">
					Leaving every box unticked means this person sees no case files at all — which is the
					right default for a new account, and not a bug.
				</p>

				<Button type="submit">Save access</Button>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
