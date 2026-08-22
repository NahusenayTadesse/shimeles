<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import Errors from '$lib/formComponents/Errors.svelte';
	import InputComp from '$lib/formComponents/InputComp.svelte';
	import { ShieldCheck, UserPlus } from '@lucide/svelte';

	let { data } = $props();

	const { form, errors, enhance, delayed, message, allErrors } = superForm(data.form, {
		resetForm: false
	});

	$effect(() => {
		if ($message?.type === 'error') toast.error($message.text);
	});
</script>

<svelte:head>
	<title>First-run setup</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-muted/30 p-4">
	<Card.Root class="w-full max-w-md p-8">
		<div class="mb-6 flex flex-col gap-1">
			<h1 class="font-heading text-2xl font-semibold">Create the first administrator</h1>
			<p class="text-sm text-muted-foreground">
				This page closes itself as soon as one account exists.
			</p>
		</div>

		<Alert.Root class="mb-6">
			<ShieldCheck class="size-4" />
			<Alert.Description>
				This account gets full access, including site settings, the form builder and user
				management. Use a password you do not use anywhere else.
			</Alert.Description>
		</Alert.Root>

		<form method="post" use:enhance class="flex flex-col gap-4">
			<Errors allErrors={$allErrors} />

			<InputComp
				{errors}
				bind:value={$form.name}
				name="name"
				label="Your name"
				type="text"
				autocomplete="name"
				labelClass=""
				required
			/>

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
				autocomplete="new-password"
				labelClass=""
				required
			/>

			<InputComp
				{errors}
				bind:value={$form.confirmPassword}
				name="confirmPassword"
				label="Confirm password"
				type="password"
				autocomplete="new-password"
				labelClass=""
				required
			/>

			<Button type="submit" class="mt-2">
				{#if $delayed}
					<LoadingBtn name="Creating" />
				{:else}
					<UserPlus class="size-4" /> Create administrator
				{/if}
			</Button>
		</form>
	</Card.Root>
</div>
