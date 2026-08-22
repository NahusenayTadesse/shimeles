<script lang="ts">
	import { CircleAlert } from '@lucide/svelte';
	import { fieldHref, fieldId, focusField } from './form-errors';

	/**
	 * The summary of everything wrong with the form.
	 *
	 * Each row is a link to the control it is about. That is the part that was
	 * missing: the summary sits at the top of a form that can be several
	 * screens long, so reading "Phone number is not valid" told you what was
	 * wrong but not where — and every control has a real `id` now, so a
	 * `#applicantName` link genuinely lands on the field.
	 *
	 * The container takes focus (`tabindex="-1"`) so a failed submit can send
	 * the caret here when the first bad field cannot be found.
	 */

	let {
		allErrors,
		id = 'form-errors'
	}: { allErrors: { path?: unknown; messages?: string[] }[]; id?: string } = $props();

	/**
	 * A field can fail more than one way at once, and `messages` is an array.
	 * Interpolating it directly let Svelte join it with a bare comma, so two
	 * problems on one field arrived as a single run-on sentence with no space
	 * after the comma. Joined as sentences instead.
	 */
	const join = (messages: string[] | undefined) =>
		(messages ?? []).map((message) => message.replace(/\s*$/, '')).join(' · ');

	function jump(event: MouseEvent, path: unknown) {
		const target = fieldId(path);
		if (!target) return;
		// Focus, not just the anchor's default jump: `focusField` also puts the
		// caret in the control, which the browser's `#hash` behaviour does not.
		if (focusField(target)) event.preventDefault();
	}
</script>

{#if allErrors.length}
	<div
		{id}
		role="alert"
		aria-live="assertive"
		tabindex="-1"
		class="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-red-800 outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
	>
		<div class="flex items-center justify-between">
			<strong class="text-sm font-semibold">
				{allErrors.length === 1 ? 'Please fix this' : `Please fix these ${allErrors.length} things`}
			</strong>
		</div>

		<ul class="mt-2 space-y-1 text-sm">
			{#each allErrors as error (fieldId(error.path) ?? error.messages)}
				{@const href = fieldHref(error.path)}
				<li class="flex items-start gap-2">
					<CircleAlert class="mt-0.5 size-4 shrink-0" />
					{#if href}
						<a
							{href}
							class="underline underline-offset-2 hover:no-underline"
							onclick={(event) => jump(event, error.path)}
						>
							{join(error.messages)}
						</a>
					{:else}
						<span>{join(error.messages)}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
{/if}
