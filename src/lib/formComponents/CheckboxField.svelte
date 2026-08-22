<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { CircleAlert } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	/**
	 * One boolean question: a consent box, an opt-in, a declaration.
	 *
	 * It exists mainly to own the hidden input. A `<Checkbox>` is not a native
	 * control and posts nothing, so every hand-rolled instance paired it with an
	 * `<input type="hidden">` mirroring the boolean — and an unticked box
	 * therefore posts the *string* `"false"`, which `z.coerce.boolean()` turns
	 * into `true`. That inverted several fields across `/donate` and `/contact`,
	 * including newsletter consent, and it was invisible at each call site
	 * because the hidden input looked like plumbing. Writing it once means the
	 * next boolean question cannot re-lay the trap; the server side is
	 * `flagField()` in `$lib/forms/fields`.
	 *
	 * `invert` is for a question asked in the negative — "it may not be safe to
	 * contact me" against a `safeToContact` field — so the call site keeps the
	 * wording it wants without the reader having to unpick a `!` in a binding.
	 */
	let {
		/**
		 * Omit on a `dataType: 'json'` form. Those post the whole `$form` object
		 * as one serialised field, so their controls carry no `name` and no
		 * hidden mirror is wanted — only the multipart forms need one.
		 */
		name = undefined,
		/** Overrides the generated id the label points at. */
		id = undefined,
		checked = $bindable(false),
		label = '',
		hint = '',
		invert = false,
		disabled = false,
		errors = undefined,
		fieldErrors: explicitErrors = undefined,
		class: className = '',
		children = undefined
	}: {
		name?: string;
		id?: string;
		checked?: boolean;
		label?: string;
		hint?: string;
		invert?: boolean;
		disabled?: boolean;
		errors?: any;
		fieldErrors?: unknown;
		class?: string;
		children?: Snippet;
	} = $props();

	const shown = $derived(invert ? !checked : checked);

	/**
	 * Something for the label's `for` to point at. `name` when there is one, so
	 * the id is stable and readable; otherwise a generated one, because the
	 * JSON-posted forms give their controls no name at all and a label pointing
	 * at nothing is exactly the bug above.
	 */
	const generated = $props.id();
	const controlId = $derived(id ?? name ?? generated);

	function flattenErrors(err: unknown): string[] {
		if (!err) return [];
		if (typeof err === 'string') return [err];
		if (Array.isArray(err)) {
			return err.flatMap((e) => (typeof e === 'string' ? e : flattenErrors(e)));
		}
		if (typeof err === 'object') return Object.values(err).flatMap((v) => flattenErrors(v));
		return [String(err)];
	}

	const messages = $derived(
		explicitErrors !== undefined
			? flattenErrors(explicitErrors)
			: errors && name
				? flattenErrors($errors[name])
				: []
	);
</script>

<div class="flex flex-col gap-1 {className}">
	<!--
		The label sits *beside* the box with a `for`, rather than wrapping it.

		It used to wrap, and that quietly broke the most important control on the
		site. `<Checkbox>` renders a `<button role="checkbox">`, and a `<label>`
		that merely wraps a button does not forward clicks to it the way it does
		for a native input — so the words next to every consent box on `/apply`,
		`/donate` and `/contact` were dead, and the only way to give consent was to
		hit the box itself, about 18 pixels square. Most people tick a box by
		clicking its words.

		A `for`/`id` pair does forward the click, because a `<button>` is a
		labelable element. Not both: wrapping *and* `for` would toggle twice when
		the box itself is clicked.
	-->
	<div class="flex items-start gap-3">
		<Checkbox
			id={controlId}
			checked={shown}
			{disabled}
			onCheckedChange={(next) => (checked = invert ? next !== true : next === true)}
			class="mt-0.5"
		/>
		<label for={controlId} class="min-w-0 cursor-pointer text-sm">
			{#if children}{@render children()}{:else}{label}{/if}
			{#if hint}
				<span class="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
			{/if}
		</label>
	</div>

	{#if name}
		<!-- The value the server actually reads. `String(...)` on purpose: see above. -->
		<input type="hidden" {name} value={String(checked ?? false)} />
	{/if}

	{#if messages.length}
		{#each messages as error (error)}
			<p class="flex items-center gap-2 text-sm text-destructive">
				<CircleAlert class="size-4 shrink-0" />
				{error}
			</p>
		{/each}
	{/if}
</div>
