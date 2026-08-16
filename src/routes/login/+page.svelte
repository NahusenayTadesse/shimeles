<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import Errors from '$lib/formComponents/Errors.svelte';
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

		<form method="post" use:enhance class="flex flex-col gap-4">
			<Errors allErrors={$allErrors} />

			<div class="flex flex-col gap-2">
				<Label for="email">Email</Label>
				<Input
					id="email"
					name="email"
					type="email"
					autocomplete="email"
					bind:value={$form.email}
					required
				/>
				{#if $errors.email}<p class="text-sm text-destructive">{$errors.email}</p>{/if}
			</div>

			<div class="flex flex-col gap-2">
				<Label for="password">Password</Label>
				<Input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					bind:value={$form.password}
					required
				/>
				{#if $errors.password}<p class="text-sm text-destructive">{$errors.password}</p>{/if}
			</div>

			<Button type="submit" class="mt-2">
				{#if $delayed}
					<LoadingBtn name="Signing in" />
				{:else}
					<LogIn class="size-4" /> Sign in
				{/if}
			</Button>
		</form>

		<p class="mt-6 text-center text-xs text-muted-foreground">
			<a href="/" class="hover:text-foreground">← Back to the public site</a>
		</p>
	</Card.Root>
</div>
