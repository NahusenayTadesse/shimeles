<script lang="ts">
	import { Input } from '$lib/components/ui/input/index';
	import { Textarea } from '$lib/components/ui/textarea/index';
	import { Label } from '$lib/components/ui/label/index.js';
	import FileUpload from './FileUpload.svelte';
	import DatePicker2 from './DatePicker2.svelte';
	import SelectComp from './SelectComp.svelte';
	import ComboboxComp from './ComboboxComp.svelte';
	import CheckboxComp from './CheckboxComp.svelte';
	import RichTextEditor from './RichTextEditor.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { CircleAlert, Eye, EyeOff } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';

	/**
	 * One labelled form control, with its error message.
	 *
	 * The value is bound directly (`bind:value`) rather than read out of a
	 * Superforms store by name. That is what lets the same component serve the
	 * dashboard's generated screens, which bind `$form[key]`, and the public
	 * forms, whose repeated sections bind a loop variable — `item.description`
	 * inside `{#each $form.items as item}` is not reachable as `$form[name]`, and
	 * hard-wiring the store was the reason `/apply`, `/volunteer`, `/donate`,
	 * `/contact` and the in-kind form each hand-rolled every field instead.
	 *
	 * `form` is still accepted, but only `type="file"` uses it: `FileUpload`
	 * mirrors the selection through `fileProxy` and needs the store itself.
	 */
	let {
		label,
		/** Only for `type="file"`. Every other control binds `value`. */
		form = undefined,
		name,
		value = $bindable(),
		/** The Superforms errors store; messages are looked up by `name`. */
		errors = undefined,
		/**
		 * Messages for this field, when they cannot be looked up by name — a
		 * nested path such as `$errors.items?.[i]?.quantity`.
		 */
		fieldErrors: explicitErrors = undefined,
		type,
		required = false,
		max = '',
		min = '',
		maxlength = undefined,
		step = 'any',
		placeholder = '',
		autocomplete = undefined,
		rows = 5,
		items = [],
		oldDays = true,
		year = false,
		futureDays = false,
		image = '',
		className = '',
		/** Help text under the control, for a question that needs a sentence. */
		hint = '',
		/**
		 * The dashboard's field names are short and lower-case, so they read
		 * better title-cased; a public form's labels are written as sentences and
		 * must not be. Defaults to the dashboard's behaviour so the 28 generated
		 * screens are unchanged.
		 */
		labelClass = 'capitalize',
		/** Falls back to `name`, so the label points at the control it labels. */
		id = undefined,
		/**
		 * Draws the asterisk without setting the HTML `required` attribute.
		 *
		 * The two are deliberately separate. `/apply` marks its few genuinely
		 * needed questions with an asterisk but does not let the browser block
		 * the submit — §3.3 makes the form low-barrier, and someone in the middle
		 * of a crisis being refused by their own browser is exactly what that
		 * rule exists to prevent. The server decides what is required.
		 */
		showRequired = false,
		/** Passed through to a `select`'s trigger — see `SelectComp`. */
		triggerClass = 'capitalize',
		...rest
	} = $props();

	const controlId = $derived(id ?? name);

	/**
	 * Whether a password field is currently showing its characters.
	 *
	 * Per-field, because the component is one control — the login form's single
	 * box and the change-password screen's three each keep their own state, so
	 * revealing the one you are stuck on does not put the other two on screen.
	 *
	 * It deliberately resets to hidden on every render of a fresh component: the
	 * value is never revealed by default, only by an explicit click.
	 */
	let revealed = $state(false);

	/*
	 * A revealed box re-masks itself when something else empties it.
	 *
	 * `resetForm` clears the change-password screen on success, and a field left
	 * revealed would then show the *next* password in plain text on a screen
	 * nobody expected to be readable. Only the non-empty → empty transition
	 * counts: clicking the eye on an empty box to watch yourself type is a
	 * deliberate choice, and re-masking that would fight the person using it.
	 */
	let previousValue = '';
	$effect(() => {
		const current = value ?? '';
		if (previousValue !== '' && current === '') revealed = false;
		previousValue = current;
	});

	/**
	 * A calendar with only arrows is the wrong control for a date of birth.
	 *
	 * To reach 1985 from today a volunteer coordinator clicks the back arrow
	 * roughly 490 times. `DatePicker2` can show a year dropdown, but only when
	 * it is told to — and it was told on `/apply` and nowhere else, so the same
	 * question on `/volunteer` and on the beneficiary screen had the 490-click
	 * version. Detecting it from the field name means the next date-of-birth
	 * field cannot miss it either.
	 */
	const yearDropdown = $derived(year || (oldDays && /birth|dob/i.test(String(name ?? ''))));

	/**
	 * `for` only points at controls a label can actually be associated with.
	 *
	 * The date, select, combobox, multi-checkbox and file branches all render a
	 * button or a composite widget rather than an `<input id=…>`, so a `for`
	 * pointing at them resolves to nothing — which is worse than no `for` at
	 * all, because a screen reader announces the control as unlabelled either
	 * way and a validator reports a broken reference on top.
	 */
	const LABELABLE = ['text', 'email', 'tel', 'password', 'number', 'url', 'search', 'textarea'];
	const labelFor = $derived(LABELABLE.includes(type) ? controlId : undefined);

	function flattenErrors(err: unknown): string[] {
		if (!err) return [];
		if (typeof err === 'string') return [err];
		if (Array.isArray(err)) {
			return err.flatMap((e) => (typeof e === 'string' ? e : flattenErrors(e)));
		}
		if (typeof err === 'object') {
			return Object.values(err).flatMap((v) => flattenErrors(v));
		}
		return [String(err)];
	}

	const fieldErrors = $derived(
		explicitErrors !== undefined
			? flattenErrors(explicitErrors)
			: errors
				? flattenErrors($errors[name])
				: []
	);
</script>

<div class="flex w-full max-w-full flex-col justify-start gap-2 p-1">
	{#if label}
		<Label for={labelFor} class={labelClass}>
			{label}{#if showRequired}<span class="ml-0.5 text-destructive">*</span>{/if}
		</Label>
	{/if}

	{#if type === 'textarea'}
		<Textarea
			class={className}
			id={controlId}
			{name}
			bind:value
			{required}
			{rows}
			{maxlength}
			{placeholder}
			{...rest}
		/>
	{:else if type === 'richtext'}
		<!-- Body copy staff author themselves. Stored as HTML and rendered through
		     `.prose-block`, which hands back the list markers and heading sizes
		     Tailwind's reset strips. -->
		<RichTextEditor bind:value placeholder={placeholder || 'Write here…'} />
		<input type="hidden" {name} bind:value />
	{:else if type === 'file'}
		<FileUpload {name} {form} {image} {placeholder} />
	{:else if type === 'select'}
		<SelectComp {name} bind:value {items} {placeholder} {triggerClass} />
	{:else if type === 'date'}
		<DatePicker2 bind:data={value} {oldDays} year={yearDropdown} {futureDays} />
		<input type="hidden" {name} bind:value />
	{:else if type === 'combo'}
		<ComboboxComp {name} bind:value {items} {required} />
	{:else if type === 'checkbox'}
		<!-- `CheckboxComp` owns the posting: one hidden input per ticked value,
		     all under `name`. It used to be given no name and mirrored through a
		     single joined hidden input here, which is what made a multi-answer
		     question arrive as one comma-separated string. -->
		<CheckboxComp {name} {items} bind:checkedValues={value} />
	{:else if type === 'checkboxSingle'}
		<div class="flex items-center gap-2">
			<!-- Controlled rather than `bind:checked`, because `bind:` on a value
			     that starts out `undefined` is a hard error in Svelte 5
			     (`props_invalid_value`) — and a generated form whose consent box has
			     no default crashed the whole page on render because of it. Coercing
			     here means an absent value simply reads as unticked. -->
			<Checkbox
				id={controlId}
				class={className}
				checked={value === true}
				onCheckedChange={(ticked) => (value = ticked === true)}
			/>
			<Label for={controlId} class={labelClass}>{placeholder}</Label>
			<!-- `String(value)`, and read by `flagField` on the server: an unticked
			     box posts the *string* "false", which `z.coerce.boolean()` turns
			     into `true`. See the note in `$lib/forms/fields`. -->
			<input type="hidden" {name} value={String(value === true)} />
		</div>
	{:else if type === 'password'}
		<!-- A password box you cannot read back is where typos live, and the cost
		     falls hardest on exactly the passwords worth having: long ones, typed
		     on a phone keyboard. The reveal is a real `<button type="button">`, so
		     it neither submits the form nor is skipped by keyboard navigation, and
		     the input keeps `type="password"` until it is pressed — a manager's
		     password does not sit legible on screen by default. -->
		<div class="relative">
			<Input
				class={cn('pr-9', className)}
				id={controlId}
				type={revealed ? 'text' : 'password'}
				{name}
				bind:value
				{maxlength}
				{placeholder}
				{autocomplete}
				{required}
				{...rest}
			/>
			<button
				type="button"
				class="absolute inset-y-0 right-0 flex h-10 w-9 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				aria-label={revealed ? 'Hide password' : 'Show password'}
				aria-pressed={revealed}
				aria-controls={controlId}
				onclick={() => (revealed = !revealed)}
			>
				{#if revealed}
					<EyeOff class="size-4" />
				{:else}
					<Eye class="size-4" />
				{/if}
			</button>
		</div>
	{:else}
		<Input
			class={className}
			id={controlId}
			{type}
			{name}
			{step}
			bind:value
			{max}
			{min}
			{maxlength}
			{placeholder}
			{autocomplete}
			{required}
			{...rest}
		/>
	{/if}

	{#if hint}
		<p class="text-sm text-muted-foreground">{hint}</p>
	{/if}

	{#if fieldErrors.length}
		{#each fieldErrors as error (error)}
			<p class="flex items-center gap-2 text-sm text-destructive">
				<CircleAlert class="size-4 shrink-0" />
				{error}
			</p>
		{/each}
	{/if}
</div>
