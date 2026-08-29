<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import Errors from '$lib/formComponents/Errors.svelte';
	import { Trash } from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';

	let {
		data,
		action = '?/delete',
		restoreAction = '?/restore',
		id,
		/** Shown in the confirmation so an admin can see what they are removing. */
		name = ''
	}: {
		data: any;
		action?: string;
		restoreAction?: string;
		id: number;
		name?: string;
	} = $props();

	const formId = `del-${id}`;

	/**
	 * The toast is raised from `onUpdate`, not from an effect on `$message`.
	 *
	 * A successful write invalidates the page, and `content-page.svelte` keys
	 * the whole table on its rows — so the new rows tear down every dialog in
	 * it, this one included, before an effect watching `$message` ever gets to
	 * run. The result: deleting worked, and said nothing at all. `onUpdate`
	 * fires while the component is still alive.
	 */
	const { form, enhance, delayed, allErrors } = superForm(data, {
		resetForm: false,
		id: formId,
		onUpdate({ form: result }) {
			const outcome = result.message as { type?: string; text?: string; undo?: number } | undefined;
			if (!outcome?.text) return;

			if (outcome.type === 'error') {
				toast.error(outcome.text);
				return;
			}

			// `undo` is only sent for a row that is still there to bring back, so
			// the button appears exactly when it would work.
			const deletedId = outcome.undo;
			toast.success(outcome.text, {
				duration: deletedId == null ? 4000 : 10000,
				action: deletedId == null ? undefined : { label: 'Undo', onClick: () => undo(deletedId) }
			});
			open = false;
		}
	});

	$form.id = id;

	let open = $state(false);

	/**
	 * Puts the row back.
	 *
	 * Posts to the action rather than rendering a second form, because the row
	 * this belongs to is gone from the page by the time anybody would press it.
	 */
	async function undo(deletedId: number) {
		const body = new FormData();
		body.set('id', String(deletedId));
		try {
			// The header asks SvelteKit for the action's result as JSON. Without
			// it a form action answers a plain POST with a redirect, and a
			// validation failure would come back looking like success.
			const response = await fetch(restoreAction, {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = response.ok ? await response.json() : null;
			if (result?.type !== 'success') throw new Error(result?.type ?? String(response.status));
			await invalidateAll();
			toast.success(`${name ? `"${name}"` : 'That'} is back`);
		} catch {
			toast.error('Could not bring it back. Reload and try again.');
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger class={buttonVariants({ variant: 'destructive', size: 'sm' })}>
		<Trash class="size-4" />
	</Dialog.Trigger>
	<Dialog.Content class="w-full">
		<Dialog.Header>
			<Dialog.Title>Delete</Dialog.Title>
		</Dialog.Header>
		<ScrollArea class="h-auto rounded-md border p-2">
			<!--
				It used to say "This action cannot be undone", which was not true:
				deleting writes a tombstone and leaves the row where it is. Telling
				somebody a reversible act is final makes them hesitate over the
				easy ones and, worse, makes the warning worthless on the day it
				matters. What is true is that it goes straight away, and that the
				way back is a button on the toast rather than something they can
				come looking for tomorrow.
			-->
			<h5 class="text-center">
				Delete {name ? `"${name}"` : 'this item'}?
			</h5>
			<p class="mt-1 text-center text-sm text-muted-foreground">
				It disappears from the dashboard and the public site at once. The record is kept, so there
				is an Undo on the message that follows — after that, bringing it back needs a developer.
			</p>
			<div class="flex flex-row items-end justify-center gap-4 pt-4">
				<form method="post" id={formId} {action} use:enhance>
					<Errors allErrors={$allErrors} />
					<input type="hidden" name="id" value={$form.id} />
					<Button type="submit" variant="destructive" form={formId} class="mt-4">
						{#if $delayed}
							<LoadingBtn name="Deleting" />
						{:else}
							<Trash class="size-4" /> Delete
						{/if}
					</Button>
				</form>
				<Button variant="outline" onclick={() => (open = false)} class="mt-4">Cancel</Button>
			</div>
		</ScrollArea>
	</Dialog.Content>
</Dialog.Root>
