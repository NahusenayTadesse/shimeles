<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Errors from '$lib/formComponents/Errors.svelte';
	import { focusFirstError } from '$lib/formComponents/form-errors';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import DetailsFields from '$lib/volunteer/DetailsFields.svelte';
	import { ShieldCheck } from '@lucide/svelte';
	import { ALWAYS_ASKED, VOLUNTEER_FORM_SECTIONS } from '$lib/volunteer-form-parts';
	import { formatDate } from '$lib/dates';

	let { data } = $props();

	const { form, errors, enhance, delayed, message, allErrors, tainted } = superForm(data.form, {
		dataType: 'json',
		resetForm: false,
		taintedMessage: 'You have unsaved changes. Leave anyway?'
	});

	$effect(() => {
		if (!$message) return;
		if ($message.type === 'error') {
			toast.error($message.text);
			focusFirstError($allErrors);
		} else {
			toast.success($message.text);
			$tainted = undefined;
		}
	});

	/**
	 * Staff see the whole form. The show/hide list on the invite decides what a
	 * *volunteer* is asked; it has never been about what the Foundation records.
	 */
	const visible = [
		...VOLUNTEER_FORM_SECTIONS.flatMap((section) => section.parts.flatMap((part) => part.fields)),
		...ALWAYS_ASKED
	].filter(
		// The four declarations are not on this form — see the note in
		// `adminDetailsSchema`. Filtering them here keeps the shared component
		// from rendering checkboxes with nothing behind them.
		(key) =>
			![
				'consentBackgroundCheck',
				'agreeCodeOfConduct',
				'declareAccurate',
				'acknowledgeNoGuarantee'
			].includes(key)
	);

	const fmt = (value: Date | string | null) => formatDate(value, '');

	const declarations = $derived([
		{ label: 'Background check consent', at: data.declarations.backgroundCheckConsentAt },
		{ label: 'Code of conduct', at: data.declarations.codeOfConductAgreedAt },
		{ label: 'Declared accurate', at: data.declarations.declaredAccurateAt },
		{ label: 'Understands no guarantee', at: data.declarations.acknowledgedNoGuaranteeAt }
	]);
</script>

<svelte:head><title>Their details · {data.application.fullName}</title></svelte:head>

<div class="flex flex-col gap-4">
	<div class="flex flex-col gap-2">
		<span class="font-mono text-sm text-muted-foreground">{data.application.reference}</span>
		<h1 class="font-heading text-2xl font-bold">{data.application.fullName}'s details</h1>
		<p class="max-w-prose text-sm text-muted-foreground">
			For a volunteer who would rather talk than type. Nothing here is required — save what you have
			and come back to the rest. If they would rather fill it in themselves,
			<a href="/dashboard/volunteers/{data.application.id}" class="underline underline-offset-2"
				>send them their form</a
			>.
		</p>
	</div>

	{#if data.application.motivation}
		<Card.Root class="p-6">
			<h2 class="mb-2 font-heading text-sm font-semibold text-muted-foreground">
				What they wrote when they applied
			</h2>
			<p class="text-sm whitespace-pre-line">{data.application.motivation}</p>
		</Card.Root>
	{/if}

	{#if data.locked.credentials || data.locked.references}
		<Alert.Root>
			<ShieldCheck class="size-4" />
			<Alert.Title>Some rows here are not yours to overwrite</Alert.Title>
			<Alert.Description>
				{data.locked.credentials
					? `${data.locked.credentials} credential${data.locked.credentials > 1 ? 's have' : ' has'} been verified`
					: ''}{data.locked.credentials && data.locked.references ? ' and ' : ''}{data.locked
					.references
					? `${data.locked.references} reference${data.locked.references > 1 ? 's have' : ' has'} been contacted`
					: ''}. Those rows stay as they are whatever is saved here — the approval gate reads them,
				and a re-save must not quietly reset it. Change an outcome on the volunteer's file instead.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<form method="post" action="?/save" use:enhance class="flex flex-col gap-4">
		<Errors allErrors={$allErrors} />

		<DetailsFields {form} {errors} catalog={data.catalog} {visible} mode="admin" />

		<Card.Root class="p-6">
			<h2 class="mb-2 font-heading text-lg font-semibold">Declarations</h2>
			<p class="mb-4 max-w-prose text-sm text-muted-foreground">
				Shown, not asked. Each of these records the moment this volunteer agreed to something, and
				nobody can agree on their behalf — not from this screen either. They are given by the
				volunteer through their own link.
			</p>
			<dl class="grid gap-2 sm:grid-cols-2">
				{#each declarations as declaration (declaration.label)}
					<div class="flex items-center justify-between gap-2 rounded-lg border p-3">
						<dt class="text-sm">{declaration.label}</dt>
						<dd>
							{#if declaration.at}
								<Badge variant="outline">{fmt(declaration.at)}</Badge>
							{:else}
								<Badge variant="secondary">Not given</Badge>
							{/if}
						</dd>
					</div>
				{/each}
			</dl>
		</Card.Root>

		<div class="flex justify-end gap-2">
			<Button type="submit" size="lg" disabled={$delayed}>
				{#if $delayed}
					<LoadingBtn name="Saving" />
				{:else}
					Save their details
				{/if}
			</Button>
		</div>
	</form>
</div>
