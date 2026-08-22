<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { CircleAlert } from '@lucide/svelte';

	/**
	 * Pick one of a handful of options, drawn as a row of pills.
	 *
	 * A `<select>` for three choices hides two of them behind a tap; the public
	 * forms use pills throughout for that reason, and had rebuilt the same
	 * button-plus-`aria-checked`-plus-hidden-input block at every one. This is
	 * that block, with the radio semantics — `role="radiogroup"`, `role="radio"`,
	 * `aria-checked`, a label the group is described by — kept in one place
	 * rather than depending on each call site remembering them.
	 *
	 * Values are compared with `String()` so a numeric id (a pillar, a language)
	 * and its posted form both match, and `null` is a legitimate option — "no
	 * preference", "not sure yet" — rather than an absence.
	 */
	type Option = { value: string | number | boolean | null; name: string };

	let {
		name,
		value = $bindable(),
		options = [],
		label = '',
		hint = '',
		size = 'sm',
		errors = undefined,
		fieldErrors: explicitErrors = undefined,
		class: className = ''
	}: {
		name?: string;
		value?: string | number | boolean | null;
		options: Option[];
		label?: string;
		hint?: string;
		size?: 'sm' | 'default' | 'lg';
		errors?: any;
		fieldErrors?: unknown;
		class?: string;
	} = $props();

	const labelId = $derived(`${name ?? 'choice'}-label`);
	const same = (a: unknown, b: unknown) => String(a) === String(b);

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

<div class="flex flex-col gap-2 {className}">
	{#if label}
		<Label id={labelId}>{label}</Label>
	{/if}

	<div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={label ? labelId : undefined}>
		{#each options as option (String(option.value))}
			<Button
				type="button"
				{size}
				role="radio"
				aria-checked={same(value, option.value)}
				variant={same(value, option.value) ? 'default' : 'outline'}
				onclick={() => (value = option.value)}
			>
				{option.name}
			</Button>
		{/each}
	</div>

	{#if name}
		<input
			type="hidden"
			{name}
			value={value === null || value === undefined ? '' : String(value)}
		/>
	{/if}

	{#if hint}
		<p class="text-sm text-muted-foreground">{hint}</p>
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
