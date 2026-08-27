<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import Errors from '$lib/formComponents/Errors.svelte';
	import InputComp from '$lib/formComponents/InputComp.svelte';
	import { LogIn } from '@lucide/svelte';

	let { data } = $props();

	const { form, errors, enhance, delayed, message, allErrors } = superForm(data.form, {
		resetForm: false
	});

	$effect(() => {
		if ($message?.type === 'error') toast.error($message.text);
	});
</script>

<svelte:head>
	<title>Sign in · {data.settings?.['site.name'] ?? 'Shimeles Abera Foundation'}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-muted/30 p-4">
	<Card.Root class="w-full max-w-md p-8">
		<div class="mb-6 flex flex-col gap-1">
			<h1 class="font-heading text-2xl font-semibold">Staff sign in</h1>
			<p class="text-sm text-muted-foreground">
				{data.settings?.['site.name'] ?? 'Shimeles Abera Foundation'}
			</p>
		</div>

		{#if data.reset}
			<p class="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm" role="status">
				Your password has been changed. Sign in with it to continue.
			</p>
		{/if}

		{#if data.suspended}
			<p
				class="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
				role="alert"
			>
				This account has been suspended. Please contact an administrator.
			</p>
		{/if}

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

			<InputComp
				{errors}
				bind:value={$form.password}
				name="password"
				label="Password"
				type="password"
				autocomplete="current-password"
				labelClass=""
				required
			/>

			<Button type="submit" class="mt-2">
				{#if $delayed}
					<LoadingBtn name="Signing in" />
				{:else}
					<LogIn class="size-4" /> Sign in
				{/if}
			</Button>
		</form>

		<p
			class="mt-6 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground"
		>
			<a href="/forgot-password" class="hover:text-foreground">Forgotten your password?</a>
			<a href="/magic-link" class="hover:text-foreground">Email me a sign-in link</a>
		</p>
		<p class="mt-2 text-center text-xs text-muted-foreground">
			<a href="/" class="hover:text-foreground">← Back to the public site</a>
		</p>
	</Card.Root>
</div>
