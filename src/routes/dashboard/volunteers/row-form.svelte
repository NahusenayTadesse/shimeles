<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import type { Snippet } from 'svelte';

	/**
	 * One row's post to one action on this page.
	 *
	 * Every control in the table submits through here, so the toast and the
	 * refresh are written once. Without it each of the six cell components would
	 * carry its own copy of "show what the server said", and the copies would
	 * disagree about whether a refused approval is an error or a shrug.
	 *
	 * `use:enhance`'s default already re-runs the page load on success, which is
	 * what makes a ticked check redraw the safeguarding badge and re-enable the
	 * approved statuses in the row above it.
	 */
	let {
		action,
		id,
		children,
		class: className = ''
	}: {
		action: string;
		id: number;
		/** Receives `submit`, for a control that posts on change rather than on a button. */
		children: Snippet<[{ submit: () => void }]>;
		class?: string;
	} = $props();

	let formEl: HTMLFormElement;

	/**
	 * `requestSubmit` rather than `submit`, so `use:enhance` sees the event —
	 * `form.submit()` bypasses the submit listener entirely and would navigate
	 * the whole page away from the table.
	 */
	const submit = () => formEl.requestSubmit();
</script>

<form
	bind:this={formEl}
	method="post"
	{action}
	class={className}
	use:enhance={() => {
		return async ({ result, update }) => {
			if (result.type === 'failure') {
				// A refused approval arrives here: the gate's own sentence, which
				// names the obstacle rather than saying "something went wrong".
				toast.error(String(result.data?.error ?? 'That did not work.'));
				return;
			}
			if (result.type === 'success' && result.data?.message) {
				toast.success(String(result.data.message));
			}
			await update({ reset: false });
		};
	}}
>
	<input type="hidden" name="id" value={id} />
	{@render children({ submit })}
</form>
