<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import Errors from '$lib/formComponents/Errors.svelte';
	import InputComp from '$lib/formComponents/InputComp.svelte';
	import { KeyRound } from '@lucide/svelte';

	let { data } = $props();

	const { form, errors, enhance, delayed, message, allErrors } = superForm(data.form, {
		resetForm: false
	});

	$effect(() => {
		if ($message?.type === 'error') toast.error($message.text);
	});
</script>

<svelte:head>
	<title
		>Choose a new password · {data.settings?.['site.name'] ?? 'Shimeles Abera Foundation'}</title
	>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-muted/30 p-4">
	<Card.Root class="w-full max-w-md p-8">
		<div class="mb-6 flex flex-col gap-1">
			<h1 class="font-heading text-2xl font-semibold">Choose a new password</h1>
			<p class="text-sm text-muted-foreground">
				Signing in everywhere else will stop, so you will need this password on your other devices.
			</p>
		</div>

		<!-- No token means the link was mangled on the way here — a mail client
		     wrapping a long URL is the usual cause. Showing the password fields
		     anyway would only fail after they had chosen one. -->
		{#if !data.hasToken}
			<p
				class="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
				role="alert"
			>
				This link is incomplete. Copy the whole address from the email, or request a new link.
			</p>
			<p class="mt-6 text-center text-xs text-muted-foreground">
				<a href="/forgot-password" class="hover:text-foreground">Request a new reset link</a>
			</p>
		{:else}
			<form method="post" use:enhance class="flex flex-col gap-4">
				<Errors allErrors={$allErrors} />

				<input type="hidden" name="token" value={$form.token} />

				<InputComp
					{errors}
					bind:value={$form.newPassword}
					name="newPassword"
					label="New password"
					type="password"
					autocomplete="new-password"
					labelClass=""
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

				<p class="text-xs text-muted-foreground">At least twelve characters.</p>

				<Button type="submit" class="mt-2">
					{#if $delayed}
						<LoadingBtn name="Saving" />
					{:else}
						<KeyRound class="size-4" /> Set my new password
					{/if}
				</Button>
			</form>

			<p class="mt-6 text-center text-xs text-muted-foreground">
				<a href="/login" class="hover:text-foreground">← Back to sign in</a>
			</p>
		{/if}
	</Card.Root>
</div>
