<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import Errors from '$lib/formComponents/Errors.svelte';
	import InputComp from '$lib/formComponents/InputComp.svelte';
	import { Wand2 } from '@lucide/svelte';

	let { data } = $props();

	const { form, errors, enhance, delayed, message, allErrors } = superForm(data.form, {
		resetForm: false
	});

	$effect(() => {
		if ($message?.type === 'error') toast.error($message.text);
	});
</script>

<svelte:head>
	<title>Sign-in link · {data.settings?.['site.name'] ?? 'Shimeles Abera Foundation'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-muted/30 p-4">
	<Card.Root class="w-full max-w-md p-8">
		<div class="mb-6 flex flex-col gap-1">
			<h1 class="font-heading text-2xl font-semibold">Email me a sign-in link</h1>
			<p class="text-sm text-muted-foreground">
				Sign in without your password. The link works once and expires in fifteen minutes.
			</p>
		</div>

		{#if data.expired}
			<p
				class="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
				role="alert"
			>
				That sign-in link has already been used or has expired. Request a new one below.
			</p>
		{/if}

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
						<Wand2 class="size-4" /> Email me a sign-in link
					{/if}
				</Button>
			</form>

			<p
				class="mt-6 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground"
			>
				<a href="/login" class="hover:text-foreground">← Back to sign in</a>
				<a href="/forgot-password" class="hover:text-foreground">Reset my password instead</a>
			</p>
		{/if}
	</Card.Root>
</div>
