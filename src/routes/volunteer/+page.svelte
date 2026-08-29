<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import Seo from '$lib/components/Seo.svelte';
	import { toast } from 'svelte-sonner';
	import PageHero from '$lib/content/PageHero.svelte';
	import BlockRenderer from '$lib/content/BlockRenderer.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import Errors from '$lib/formComponents/Errors.svelte';
	import { focusFirstError } from '$lib/formComponents/form-errors';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import InputComp from '$lib/formComponents/InputComp.svelte';
	import { CircleCheck, Copy } from '@lucide/svelte';

	let { data } = $props();

	const s = (key: string, fallback: string) => data.strings?.[key] ?? fallback;

	/**
	 * `dataType: 'json'` because `pillarIds` posts as an array. Flattening it
	 * into indexed field names to keep a no-JS post working would cost more in
	 * the schema than it buys on a page whose only control that needs
	 * JavaScript is that same set of checkboxes.
	 */
	const { form, errors, enhance, delayed, message, allErrors } = superForm(data.form, {
		dataType: 'json',
		resetForm: false
	});

	/** Set once the application is stored; the page then shows the reference. */
	let confirmation = $state<string | null>(null);

	$effect(() => {
		if (!$message) return;
		if ($message.type === 'error') {
			toast.error($message.text);
			focusFirstError($allErrors);
		} else {
			toast.success($message.text);
			if ($message.reference) {
				confirmation = $message.reference;
				window.scrollTo({ top: 0, behavior: 'smooth' });
			}
		}
	});

	const togglePillar = (id: number) => {
		$form.pillarIds = $form.pillarIds.includes(id)
			? $form.pillarIds.filter((pillarId) => pillarId !== id)
			: [...$form.pillarIds, id];
	};

	const copyReference = async () => {
		if (!confirmation) return;
		await navigator.clipboard.writeText(confirmation);
		toast.success('Reference copied');
	};

	/** Body copy still comes from `content_blocks`; only the form is code. */
	const contentBlocks = $derived(
		(data.page?.blocks ?? []).filter((block) => block.type !== 'form_embed')
	);
</script>

<Seo
	title={data.page?.title ?? 'Volunteer'}
	description={data.page?.metaDescription}
	image={data.page?.shareImage}
	imageAlt={data.page?.title ?? 'Volunteer'}
	breadcrumbs={[
		{ name: 'Home', path: '/' },
		{ name: data.page?.title ?? 'Volunteer', path: '/volunteer' }
	]}
/>

<PageHero
	eyebrow={s('volunteer.eyebrow', 'Give your time')}
	title={data.page?.title ?? 'Volunteer with us'}
	description={data.page?.metaDescription}
	image={data.page?.shareImage}
/>

<div class="mx-auto w-full max-w-3xl px-4 py-14 md:py-20">
	{#if confirmation}
		<Card.Root class="flex flex-col items-center gap-4 p-10 text-center">
			<div class="rounded-full bg-accent p-4 text-accent-foreground">
				<CircleCheck class="size-8" />
			</div>
			<h2 class="font-heading text-2xl font-semibold">Thank you for offering</h2>
			<p class="max-w-prose text-muted-foreground">
				We have your details and someone from the Foundation will contact you shortly. There is
				nothing else for you to do for now.
			</p>
			<button
				type="button"
				onclick={copyReference}
				class="flex items-center gap-2 rounded-full bg-muted px-5 py-3 font-mono text-lg font-semibold"
			>
				{confirmation}
				<Copy class="size-4 opacity-60" />
			</button>
			<p class="text-xs text-muted-foreground">
				Keep this reference. It is how we find you if you get in touch.
			</p>
		</Card.Root>
	{:else}
		{#if contentBlocks.length}
			<div class="mb-12 flex flex-col gap-8">
				<BlockRenderer
					blocks={contentBlocks}
					pillars={data.blocks?.pillars ?? []}
					initiatives={data.blocks?.initiatives ?? []}
					charts={data.blocks?.charts ?? {}}
					metrics={data.blocks?.metrics ?? {}}
					moneyTotals={data.blocks?.moneyTotals ?? {}}
					payments={data.blocks?.payments ?? []}
					initiativeNotice={data.settings?.['initiatives.disclaimer'] ?? ''}
				/>
			</div>
		{/if}

		<form method="post" action="?/apply" use:enhance class="flex flex-col gap-8">
			<Errors allErrors={$allErrors} />

			<!-- Honeypot. Hidden from people, irresistible to bots; a filled value
			     is accepted silently and stored nowhere. -->
			<div class="hidden" aria-hidden="true">
				<label for="website">Website</label>
				<input
					id="website"
					name="website"
					tabindex="-1"
					autocomplete="off"
					bind:value={$form.website}
				/>
			</div>

			<Card.Root class="p-6 md:p-8">
				<div class="mb-6">
					<h2 class="font-heading text-xl font-semibold">Tell us how to reach you</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Five questions, and we will take it from there.
					</p>
				</div>

				<div class="flex flex-col gap-5">
					<InputComp
						{errors}
						bind:value={$form.fullName}
						name="fullName"
						label="Full name"
						type="text"
						autocomplete="name"
						showRequired
						labelClass=""
					/>

					<div class="grid gap-5 md:grid-cols-2">
						<InputComp
							{errors}
							bind:value={$form.phone}
							name="phone"
							label="Phone number"
							type="tel"
							autocomplete="tel"
							showRequired
							labelClass=""
						/>

						<InputComp
							{errors}
							bind:value={$form.email}
							name="email"
							label="Email address"
							type="email"
							autocomplete="email"
							showRequired
							labelClass=""
						/>
					</div>

					<InputComp
						{errors}
						bind:value={$form.motivation}
						name="motivation"
						label="Why would you like to volunteer?"
						type="textarea"
						rows={5}
						maxlength={2000}
						placeholder="A sentence or two is plenty."
						hint="Tell us a little about yourself and the kind of help you would like to give."
						showRequired
						labelClass=""
					/>
				</div>
			</Card.Root>

			<Card.Root class="p-6 md:p-8">
				<div class="mb-5">
					<h2 class="font-heading text-xl font-semibold">
						Where would you like to help? <span class="text-destructive">*</span>
					</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						Choose as many as you like. It does not lock you in.
					</p>
				</div>

				<div class="grid gap-3 sm:grid-cols-2">
					{#each data.pillars as pillar (pillar.id)}
						{@const chosen = $form.pillarIds.includes(pillar.id)}
						<button
							type="button"
							onclick={() => togglePillar(pillar.id)}
							aria-pressed={chosen}
							class="flex items-start gap-3 rounded-lg border p-4 text-left transition hover:border-primary/60 {chosen
								? 'border-primary bg-primary/5 ring-1 ring-primary'
								: 'border-border'}"
						>
							<Checkbox checked={chosen} tabindex={-1} class="pointer-events-none mt-0.5" />
							<span class="min-w-0">
								<span class="block font-medium">{pillar.name}</span>
								{#if pillar.summary}
									<span class="mt-0.5 block text-sm text-muted-foreground">{pillar.summary}</span>
								{/if}
							</span>
						</button>
					{/each}
				</div>
				{#if $errors.pillarIds}
					<p class="mt-3 text-sm text-destructive">{$errors.pillarIds}</p>
				{/if}

				<div class="my-2" aria-hidden="true"></div>

				<div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
					<p class="text-sm text-muted-foreground">
						We read everything that comes in, and we will be in touch about the next step.
					</p>
					<Button type="submit" size="lg" disabled={$delayed}>
						{#if $delayed}
							<LoadingBtn name="Sending" />
						{:else}
							Send
						{/if}
					</Button>
				</div>
			</Card.Root>
		</form>
	{/if}
</div>
