<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { LogOut, ExternalLink } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import { dropdownClass } from '$lib/global.svelte';

	let { data }: { data?: string | null } = $props();

	let signingOut = $state(false);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger aria-label="Account menu">
		<Avatar.Root class="size-8">
			<Avatar.Fallback class="bg-primary font-medium text-primary-foreground">
				{data?.[0]?.toUpperCase() ?? '?'}
			</Avatar.Fallback>
		</Avatar.Root>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content class="w-52 p-1" align="end">
		<DropdownMenu.Label class="truncate">{data ?? 'Signed in'}</DropdownMenu.Label>
		<DropdownMenu.Separator />

		<DropdownMenu.Item class={dropdownClass}>
			{#snippet child({ props })}
				<a {...props} href="/" target="_blank" rel="noreferrer">
					<ExternalLink class="size-4" /> View public site
				</a>
			{/snippet}
		</DropdownMenu.Item>

		<DropdownMenu.Separator />

		<!-- Sign-out is a POST, not a link: a GET that ends a session can be
		     triggered by any image tag on any page. -->
		<DropdownMenu.Item closeOnSelect={false} class={dropdownClass}>
			{#snippet child({ props })}
				<form
					{...props}
					method="post"
					action="/dashboard?/logout"
					use:enhance={() => {
						signingOut = true;
						return async ({ update }) => {
							await update();
							signingOut = false;
						};
					}}
				>
					<button type="submit" disabled={signingOut} class="flex w-full items-center gap-2">
						{#if signingOut}
							<LoadingBtn name="Signing out" />
						{:else}
							<LogOut class="size-4" /> Sign out
						{/if}
					</button>
				</form>
			{/snippet}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
