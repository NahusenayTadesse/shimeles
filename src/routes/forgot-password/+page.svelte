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
	<title>Reset your password · {data.settings?.['site.name'] ?? 'Shimeles Abera Foundation'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-muted/30 p-4">
	<Card.Root class="w-full max-w-md p-8">
		<div class="mb-6 flex flex-col gap-1">
			<h1 class="font-heading text-2xl font-semibold">Reset your password</h1>
			<p class="text-sm text-muted-foreground">
				Tell us the address you sign in with and we will email you a link.
			</p>
		</div>

		<!-- The confirmation replaces the form. Leaving the field on screen invites
		     a second send, which is how somebody ends up with three links and uses
		     the oldest. -->
		{#if $message?.type === 'success'}
			<p class="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm" role="status">
				{$message.text}
			</p>
			<p class="mt-6 text-center text-xs text-muted-foreground">
				<a href="/login" class="hover:text-foreground">← Back to sign in</a>
			</p>
		{:else}
			<form method="post" use:enhance class="flex flex-col gap-4">
				<Errors allErrors={$allErrors} />

				<InputComp
					{errors}
					bind:value={$form.email}
					name="email"
					label="Email"
					type="email"
					autocomplete="email"
					labelClass=""
					required
				/>

				<Button type="submit" class="mt-2">
					{#if $delayed}
						<LoadingBtn name="Sending" />
					{:else}
						<KeyRound class="size-4" /> Email me a reset link
					{/if}
				</Button>
			</form>

			<p
				class="mt-6 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground"
			>
				<a href="/login" class="hover:text-foreground">← Back to sign in</a>
				<a href="/magic-link" class="hover:text-foreground">Email me a sign-in link instead</a>
			</p>
		{/if}
	</Card.Root>
</div>
