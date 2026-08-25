<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import Errors from '$lib/formComponents/Errors.svelte';
	import InputComp from '$lib/formComponents/InputComp.svelte';
	import { KeyRound, ShieldCheck } from '@lucide/svelte';

	let { data } = $props();

	const { form, errors, enhance, delayed, message, allErrors } = superForm(data.form, {
		// Cleared on success: leaving a password sitting in three boxes on a
		// shared office machine is the thing this screen exists to avoid.
		resetForm: true,
		taintedMessage: null
	});

	$effect(() => {
		if (!$message) return;
		if ($message.type === 'error') toast.error($message.text);
		else toast.success($message.text);
	});
</script>

<svelte:head><title>Change your password · Dashboard</title></svelte:head>

<div class="flex flex-col gap-4">
	<div>
		<h1 class="font-heading text-2xl font-bold">Change your password</h1>
		<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
			This changes the password for your own account{#if data.email}, <span class="font-medium"
					>{data.email}</span
				>{/if}. To reset someone else's, an administrator uses Users &amp; roles.
		</p>
	</div>

	<Card.Root class="max-w-xl p-6">
		<form method="post" use:enhance class="flex flex-col gap-4">
			<Errors allErrors={$allErrors} />

			<InputComp
				{errors}
				bind:value={$form.currentPassword}
				name="currentPassword"
				label="Current password"
				type="password"
				autocomplete="current-password"
				labelClass=""
				required
			/>

			<InputComp
				{errors}
				bind:value={$form.newPassword}
				name="newPassword"
				label="New password"
				type="password"
				autocomplete="new-password"
				labelClass=""
				hint="At least 12 characters. Use one you do not use anywhere else."
				required
			/>

			<InputComp
				{errors}
				bind:value={$form.confirmPassword}
				name="confirmPassword"
				label="Confirm new password"
				type="password"
				autocomplete="new-password"
				labelClass=""
				required
			/>

			<InputComp
				{errors}
				bind:value={$form.revokeOtherSessions}
				name="revokeOtherSessions"
				type="checkboxSingle"
				label=""
				labelClass=""
				placeholder="Sign out everywhere else"
			/>

			<Alert.Root>
				<ShieldCheck class="size-4" />
				<Alert.Description>
					Leave that ticked if you are changing this because someone may know your password. It ends
					every other session signed in as you — a browser left open at home, a phone, a shared
					machine. You stay signed in here.
				</Alert.Description>
			</Alert.Root>

			<Button type="submit" class="mt-2 self-start">
				{#if $delayed}
					<LoadingBtn name="Changing" />
				{:else}
					<KeyRound class="size-4" /> Change password
				{/if}
			</Button>
		</form>
	</Card.Root>
</div>
