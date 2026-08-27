<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import Seo from '$lib/components/Seo.svelte';
	import PageHero from '$lib/content/PageHero.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import Errors from '$lib/formComponents/Errors.svelte';
	import { focusFirstError } from '$lib/formComponents/form-errors';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import DetailsFields from '$lib/volunteer/DetailsFields.svelte';
	import { CircleCheck } from '@lucide/svelte';

	let { data } = $props();

	const { form, errors, enhance, delayed, message, allErrors, tainted } = superForm(data.form, {
		dataType: 'json',
		resetForm: false,
		taintedMessage: 'You have not finished this form. Leave anyway?'
	});

	let done = $state(false);

	$effect(() => {
		if (!$message) return;
		if ($message.type === 'error') {
			toast.error($message.text);
			focusFirstError($allErrors);
		} else {
			toast.success($message.text);
			$tainted = undefined;
			done = true;
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	});
</script>

<!-- The `noindex` is an `X-Robots-Tag` set in `load`, not a meta tag: this URL
     is one person's link to their own file, and the header is what a crawler
     that reached it by any route will obey. -->
<Seo title="Finish your application" />

<PageHero eyebrow="Volunteering" title="A few more questions" />

<div class="mx-auto w-full max-w-5xl px-4 py-14 md:py-20">
	{#if done}
		<Card.Root class="flex flex-col items-center gap-4 p-10 text-center">
			<div class="rounded-full bg-accent p-4 text-accent-foreground">
				<CircleCheck class="size-8" />
			</div>
			<h2 class="font-heading text-2xl font-semibold">Thank you</h2>
			<p class="max-w-prose text-muted-foreground">
				That is everything we need for now. Because our volunteers meet people at vulnerable
				moments, every application goes through a safeguarding review before placement — we will be
				in touch about the next step.
			</p>
			<p class="text-xs text-muted-foreground">
				Your reference is <span class="font-mono font-semibold">{data.volunteer.reference}</span>
			</p>
		</Card.Root>
	{:else}
		<div class="mb-8">
			<p class="text-muted-foreground">
				Hello {data.volunteer.fullName}. Thank you for talking to us about volunteering — this is
				the rest of what we need. Your reference is
				<span class="font-mono font-semibold">{data.volunteer.reference}</span>.
			</p>
			{#if data.alreadyCompleted}
				<p class="mt-3 text-sm text-muted-foreground">
					You have filled this in before. Your answers are below; change anything that is out of
					date and send it again.
				</p>
			{/if}
		</div>

		<form method="post" action="?/save" use:enhance class="flex flex-col gap-8">
			<Errors allErrors={$allErrors} />

			<DetailsFields {form} {errors} catalog={data.catalog} visible={data.visible} />

			<div
				class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:px-2"
			>
				<p class="text-sm text-muted-foreground">
					We read every application, and we will be in touch about the next step.
				</p>
				<Button type="submit" size="lg" disabled={$delayed}>
					{#if $delayed}
						<LoadingBtn name="Sending" />
					{:else}
						Send my answers
					{/if}
				</Button>
			</div>
		</form>
	{/if}
</div>
