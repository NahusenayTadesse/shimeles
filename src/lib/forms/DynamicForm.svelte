<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import InputComp from '$lib/formComponents/InputComp.svelte';
	import Errors from '$lib/formComponents/Errors.svelte';
	import { focusFirstError } from '$lib/formComponents/form-errors';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import { CircleCheck, Copy, Send, ShieldCheck } from '@lucide/svelte';
	import type { RenderField, RenderForm } from '$lib/forms/types';

	/**
	 * The single form renderer.
	 *
	 * Per §6 of the spec there is no per-pillar Svelte form component: the four
	 * application forms, the volunteer form and the contact form are all this
	 * file, drawing whatever `form_definitions` + `form_fields` describe. Adding
	 * a question in the dashboard adds an input here on the next request.
	 */
	let {
		form: definition,
		data,
		action = '?/submit',
		labels = {} as Record<string, string>
	}: {
		form: RenderForm;
		data: any;
		action?: string;
		labels?: Record<string, string>;
	} = $props();

	const t = (key: string, fallback: string) => labels[key] ?? fallback;

	// Left on the default multipart `dataType`, not `json`: these forms carry
	// file uploads. A multi-answer question posts one field per ticked box, which
	// multipart handles natively — see `CheckboxComp`.
	const { form, errors, enhance, delayed, message, allErrors } = superForm(data, {
		resetForm: true,
		taintedMessage: null
	});

	/** Set once the server confirms, so the page can show the reference number. */
	let reference = $state<string | null>(null);

	$effect(() => {
		if (!$message) return;
		if ($message.type === 'error') {
			toast.error($message.text);
			// The toast fades and the summary is a long way up the page; this is
			// what actually takes the person to the question they missed.
			focusFirstError($allErrors);
		} else {
			toast.success($message.text);
			reference = $message.reference ?? null;
		}
	});

	/**
	 * `InputComp` speaks the shared vocabulary of the admin form kit; the field
	 * types come out of the database. This is the one place the two meet.
	 */
	const inputType = (field: RenderField) => {
		switch (field.type) {
			case 'textarea':
				return 'textarea';
			case 'number':
				return 'number';
			case 'date':
				return 'date';
			case 'select':
				return 'select';
			// A group of tick boxes. `CheckboxComp` posts one hidden input per
			// ticked value under the field's key, which is what the schema's
			// `z.array()` reads with `getAll()`.
			case 'multiselect':
				return 'checkbox';
			case 'checkbox':
				return 'checkboxSingle';
			case 'file_upload':
				return 'file';
			case 'phone':
				return 'tel';
			case 'email':
				return 'email';
			default:
				return 'text';
		}
	};

	const items = (field: RenderField) =>
		field.options.map((option) => ({ value: option.value, name: option.label }));

	/**
	 * Conditional visibility, mirroring `isFieldVisible` on the server. This copy
	 * is a convenience — the server strips hidden answers regardless, so a field
	 * revealed by tampering with the DOM still contributes nothing.
	 */
	const visible = (field: RenderField) => {
		if (!field.showWhen) return true;
		const actual = $form[field.showWhen.key];
		if (Array.isArray(actual)) return actual.map(String).includes(field.showWhen.value);
		return String(actual ?? '') === field.showWhen.value;
	};

	const copyReference = async () => {
		if (!reference) return;
		await navigator.clipboard.writeText(reference);
		toast.success(t('form.reference_copied', 'Reference copied'));
	};
</script>

{#if reference}
	<!-- The confirmation replaces the form rather than sitting above it: someone
	     who has just described a medical crisis should not be looking at the
	     empty fields again. -->
	<div class="flex flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center">
		<div class="rounded-full bg-accent p-4 text-accent-foreground">
			<CircleCheck class="size-8" />
		</div>
		<h2 class="font-heading text-2xl font-semibold">
			{t('form.thank_you', 'Thank you, we have your request')}
		</h2>
		{#if definition.successMessage}
			<p class="max-w-prose text-muted-foreground">{definition.successMessage}</p>
		{/if}
		<div class="flex flex-col items-center gap-2">
			<span class="text-sm text-muted-foreground">
				{t('form.your_reference', 'Your reference number')}
			</span>
			<button
				type="button"
				onclick={copyReference}
				class="flex items-center gap-2 rounded-lg bg-muted px-4 py-2 font-mono text-lg font-semibold tracking-wide"
			>
				{reference}
				<Copy class="size-4 opacity-60" />
			</button>
			<span class="max-w-prose text-xs text-muted-foreground">
				{t(
					'form.reference_hint',
					'Keep this number. Quote it when you contact us about this request.'
				)}
			</span>
		</div>
	</div>
{:else}
	<form
		method="post"
		{action}
		use:enhance
		enctype="multipart/form-data"
		class="flex flex-col gap-4"
	>
		{#if definition.pillar}
			<div class="flex items-center gap-3 rounded-xl border bg-card p-4">
				<div class="rounded-lg bg-muted p-2 text-primary">
					<DynamicIcon name={definition.pillar.icon} class="size-5" />
				</div>
				<div>
					<p class="text-xs tracking-wide text-muted-foreground uppercase">
						{t('form.programme', 'Programme')}
					</p>
					<p class="font-medium">{definition.pillar.name}</p>
				</div>
			</div>
		{/if}

		{#if definition.isLowBarrier}
			<!-- The low-barrier promise, stated to the person filling the form and
			     enforced by the schema generator, not just displayed here. -->
			<Alert.Root>
				<ShieldCheck class="size-4" />
				<Alert.Title>{t('form.low_barrier_title', 'No proof of need required')}</Alert.Title>
				<Alert.Description>
					{t(
						'form.low_barrier_body',
						'You do not have to upload documents or share contact details you would rather keep private. Tell us as much or as little as you want to.'
					)}
				</Alert.Description>
			</Alert.Root>
		{/if}

		{#if definition.introText}
			<p class="prose-block max-w-prose">{definition.introText}</p>
		{/if}

		<Errors allErrors={$allErrors} />

		{#each definition.fields as field (field.key)}
			{#if field.type === 'heading'}
				<div class="mt-4 flex flex-col gap-2">
					<h3 class="font-heading text-lg font-semibold">{field.label}</h3>
					{#if field.hint}
						<p class="text-sm text-muted-foreground">{field.hint}</p>
					{/if}
				</div>
			{:else if visible(field)}
				{@const single = field.type === 'checkbox'}
				<div class="flex flex-col gap-1">
					<!--
						No `required` attribute, on purpose — `showRequired` draws the
						asterisk without it. The two are deliberately separate everywhere
						else on this site (see `InputComp`): `/apply` marks the questions it
						needs and still lets the submit through, because §3.3's low-barrier
						rule exists precisely so that someone in the middle of a crisis is
						not refused by their own browser. This renderer was the one place
						setting the attribute, which meant the browser blocked the submit
						with its own untranslated bubble on the first empty box — and every
						message the schema generates for a missing answer was unreachable.
						It also only ever fired for the native inputs, so a required
						dropdown or a required set of tick boxes was never caught this way
						at all.

						`labelClass="normal-case"` matters more than it looks. The dashboard's
						field names are short and lower-case, so `InputComp` title-cases
						labels by default — which turned questions a staff member wrote as
						sentences into "What Is The Medical Situation?" and made every public
						form read like a form letter. It also beats the `uppercase` the base
						`Label` carries, so what an applicant sees is exactly what was typed
						into the builder.
					-->
					<InputComp
						{form}
						{errors}
						bind:value={$form[field.key]}
						{...single
							? // A single checkbox is the one field whose question belongs
								// *beside* the box rather than above it. Rendered above, the
								// text was drawn by a `<Label>` with no `for` — pointing at
								// nothing, because the branch that draws the box gives the
								// box its own id — so a consent question could not be ticked
								// by clicking its own words, which is how most people tick a
								// box. Passing it as the placeholder puts it in the label the
								// box is actually associated with.
								{ label: '', placeholder: field.required ? `${field.label} *` : field.label }
							: {
									label: field.label,
									// A dropdown with no placeholder of its own falls back to
									// the field's key ("Select Referred_by"), so give it words.
									placeholder: field.placeholder ?? (field.type === 'select' ? 'Choose one…' : '')
								}}
						showRequired={!single && field.required}
						name={field.key}
						type={inputType(field)}
						items={items(field)}
						rows={6}
						oldDays={true}
						labelClass="normal-case"
						triggerClass="normal-case"
					/>
					{#if field.hint}
						<p class="px-1 text-xs text-muted-foreground">{field.hint}</p>
					{/if}
				</div>
			{/if}
		{/each}

		<div class="my-1" aria-hidden="true"></div>

		<!-- The fixed contact block. Always optional at the schema level so a
		     low-barrier form can be submitted anonymously; a form that genuinely
		     needs a phone number marks a mapped field required instead. -->
		<div class="grid gap-2 md:grid-cols-3">
			<InputComp
				{form}
				{errors}
				label={t('form.your_name', 'Your name')}
				bind:value={$form.submittedByName}
				name="submittedByName"
				type="text"
			/>
			<InputComp
				{form}
				{errors}
				label={t('form.your_phone', 'Phone')}
				bind:value={$form.submittedByPhone}
				name="submittedByPhone"
				type="tel"
			/>
			<InputComp
				{form}
				{errors}
				label={t('form.your_email', 'Email')}
				bind:value={$form.submittedByEmail}
				name="submittedByEmail"
				type="email"
			/>
		</div>

		<!-- Honeypot. Hidden from people and from screen readers; bots fill it. -->
		<div class="hidden" aria-hidden="true">
			<label for="website">Leave this empty</label>
			<input
				id="website"
				name="website"
				type="text"
				tabindex="-1"
				autocomplete="off"
				bind:value={$form.website}
			/>
		</div>

		<Button type="submit" size="lg" class="mt-2 self-start">
			{#if $delayed}
				<LoadingBtn name={t('form.sending', 'Sending')} />
			{:else}
				<Send class="size-4" />
				{t('form.submit', 'Submit')}
			{/if}
		</Button>
	</form>
{/if}
