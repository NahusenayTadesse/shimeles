<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import Errors from '$lib/formComponents/Errors.svelte';
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

			<div class="flex flex-col gap-2">
				<Label for="name">Your name</Label>
				<Input id="name" name="name" bind:value={$form.name} required />
				{#if $errors.name}<p class="text-sm text-destructive">{$errors.name}</p>{/if}
			</div>

			<div class="flex flex-col gap-2">
				<Label for="email">Email</Label>
				<Input id="email" name="email" type="email" bind:value={$form.email} required />
				{#if $errors.email}<p class="text-sm text-destructive">{$errors.email}</p>{/if}
			</div>

			<div class="flex flex-col gap-2">
				<Label for="password">Password</Label>
				<Input
					id="password"
					name="password"
					type="password"
					autocomplete="new-password"
					bind:value={$form.password}
					required
				/>
				{#if $errors.password}<p class="text-sm text-destructive">{$errors.password}</p>{/if}
			</div>

			<div class="flex flex-col gap-2">
				<Label for="confirmPassword">Confirm password</Label>
				<Input
					id="confirmPassword"
					name="confirmPassword"
					type="password"
					autocomplete="new-password"
					bind:value={$form.confirmPassword}
					required
				/>
				{#if $errors.confirmPassword}
					<p class="text-sm text-destructive">{$errors.confirmPassword}</p>
				{/if}
			</div>

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
