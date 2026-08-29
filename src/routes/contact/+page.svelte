<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import Seo from '$lib/components/Seo.svelte';
	import { MAX_CONTACT_MESSAGE } from './schema';
	import { toast } from 'svelte-sonner';
	import PageHero from '$lib/content/PageHero.svelte';
	import BlockRenderer from '$lib/content/BlockRenderer.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import Errors from '$lib/formComponents/Errors.svelte';
	import { focusFirstError } from '$lib/formComponents/form-errors';
	import InputComp from '$lib/formComponents/InputComp.svelte';
	import CheckboxField from '$lib/formComponents/CheckboxField.svelte';
	import ChoiceGroup from '$lib/formComponents/ChoiceGroup.svelte';
	import LoadingBtn from '$lib/formComponents/LoadingBtn.svelte';
	import DynamicIcon from '$lib/components/dynamic-icon.svelte';
	import SocialIcon from '$lib/components/social-icon.svelte';
	import {
		ArrowRight,
		CircleCheck,
		Clock,
		Copy,
		Mail,
		MapPin,
		MessageSquare,
		Phone
	} from '@lucide/svelte';

	let { data } = $props();

	const s = (key: string, fallback: string) => data.strings?.[key] ?? fallback;
	const setting = (key: string) => data.settings?.[key] ?? '';

	const { form, errors, enhance, delayed, message, allErrors } = superForm(data.form, {
		resetForm: false,
		taintedMessage: null
	});

	let confirmation = $state<string | null>(null);

	$effect(() => {
		if (!$message) return;
		if ($message.type === 'error') {
			toast.error($message.text);
			// The toast fades and the summary is a long way up the page; this is
			// what actually takes the person to the question they missed.
			focusFirstError($allErrors);
		} else {
			toast.success($message.text);
			confirmation = $message.reference ?? '';
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	});

	const chosenSubject = $derived(
		data.catalog.subjects.find((subject) => subject.id === $form.subjectId) ?? null
	);

	const copyReference = async () => {
		if (!confirmation) return;
		await navigator.clipboard.writeText(confirmation);
		toast.success('Reference copied');
	};

	/** The social links that are actually set. An empty setting is not a link. */
	const socials = $derived(
		(['facebook', 'instagram', 'telegram', 'linkedin', 'youtube', 'tiktok'] as const)
			.map((network) => ({ network, url: setting(`social.${network}`) }))
			.filter((link) => Boolean(link.url))
	);

	/**
	 * Offices come from `contact_offices`. The `contact.*` settings are the
	 * fallback for a site that has not added any office rows yet, so a fresh
	 * install still shows an address rather than an empty card.
	 */
	const showSettingsFallback = $derived(data.catalog.offices.length === 0);

	/** Body copy still comes from `content_blocks`; only the form is code. */
	const contentBlocks = $derived(
		(data.page?.blocks ?? []).filter((block) => block.type !== 'form_embed')
	);
</script>

<Seo
	title={data.page?.title ?? 'Contact'}
	description={data.page?.metaDescription}
	image={data.page?.shareImage}
	imageAlt={data.page?.title ?? 'Contact'}
	breadcrumbs={[
		{ name: 'Home', path: '/' },
		{ name: data.page?.title ?? 'Contact', path: '/contact' }
	]}
/>

<PageHero
	eyebrow={s('contact.eyebrow', 'Get in touch')}
	title={data.page?.title ?? 'Contact us'}
	description={data.page?.metaDescription}
	image={data.page?.shareImage}
/>

<div class="mx-auto grid w-full gap-10 px-4 py-14 md:py-20 lg:max-w-6xl lg:grid-cols-[1.3fr_1fr]">
	<div class="order-2 flex min-w-0 flex-col gap-8 lg:order-1">
		{#if contentBlocks.length}
			<BlockRenderer
				blocks={contentBlocks}
				pillars={data.blocks?.pillars ?? []}
				initiatives={data.blocks?.initiatives ?? []}
				charts={data.blocks?.charts ?? {}}
				payments={data.blocks?.payments ?? []}
			/>
		{/if}

		{#if confirmation !== null}
			<Card.Root class="flex flex-col items-center gap-4 p-10 text-center">
				<div class="rounded-full bg-accent p-4 text-accent-foreground">
					<CircleCheck class="size-8" />
				</div>
				<h2 class="font-heading text-2xl font-semibold">Message sent</h2>
				<p class="max-w-prose text-muted-foreground">
					{chosenSubject?.publicResponseNote ??
						'Someone will read this and get back to you. If it is urgent, the phone number beside this form is the faster route.'}
				</p>
				{#if confirmation}
					<button
						type="button"
						onclick={copyReference}
						class="flex items-center gap-2 rounded-full bg-muted px-5 py-3 font-mono text-lg font-semibold"
					>
						{confirmation}
						<Copy class="size-4 opacity-60" />
					</button>
					<p class="text-xs text-muted-foreground">
						Quote this reference if you write to us again about the same thing.
					</p>
				{/if}
				<Button variant="outline" onclick={() => (confirmation = null)} class="mt-2">
					Send another message
				</Button>
			</Card.Root>
		{:else}
			<Card.Root class="p-6 md:p-8">
				<div class="mb-6 flex items-center gap-3">
					<MessageSquare class="size-5 text-primary" />
					<h2 class="font-heading text-xl font-semibold">
						{s('contact.form_title', 'Send us a message')}
					</h2>
				</div>

				<form method="post" action="?/send" use:enhance class="flex flex-col gap-5">
					<Errors allErrors={$allErrors} />

					<!-- Honeypot: hidden from people, irresistible to bots. -->
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

					<!-- What it is about. The topics are catalogue rows, so adding
					     "Safeguarding concern" is an edit rather than a deploy. -->
					{#if data.catalog.subjects.length}
						<div class="flex flex-col gap-2">
							<Label id="subject-label">What is this about?</Label>
							<div class="flex flex-wrap gap-2" role="radiogroup" aria-labelledby="subject-label">
								{#each data.catalog.subjects as subject (subject.id)}
									<Button
										type="button"
										size="sm"
										role="radio"
										aria-checked={$form.subjectId === subject.id}
										variant={$form.subjectId === subject.id ? 'default' : 'outline'}
										onclick={() =>
											($form.subjectId = $form.subjectId === subject.id ? null : subject.id)}
									>
										{#if subject.icon}
											<DynamicIcon name={subject.icon} class="size-4" />
										{/if}
										{subject.name}
									</Button>
								{/each}
							</div>
							<input type="hidden" name="subjectId" value={$form.subjectId ?? ''} />

							{#if chosenSubject?.description}
								<p class="text-sm text-muted-foreground">{chosenSubject.description}</p>
							{/if}

							<!-- A topic that is really an application points at the right
							     place rather than quietly becoming a case behind the
							     sender's back. -->
							{#if chosenSubject?.suggestedPillarSlug}
								<a
									href="/programs/{chosenSubject.suggestedPillarSlug}#apply"
									class="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm hover:border-primary"
								>
									<ArrowRight class="size-4 shrink-0 text-primary" />
									<span>
										If you are asking for support from
										<strong>{chosenSubject.suggestedPillarName}</strong>, the application form is
										the faster route. It reaches the team that can actually help.
									</span>
								</a>
							{/if}
						</div>
					{/if}

					<div class="grid gap-5 md:grid-cols-2">
						<InputComp
							{errors}
							bind:value={$form.fullName}
							name="fullName"
							label="Your name"
							type="text"
							autocomplete="name"
							labelClass=""
						/>
						<InputComp
							{errors}
							bind:value={$form.organization}
							name="organization"
							label="Organisation, if any"
							type="text"
							autocomplete="organization"
							labelClass=""
						/>
						<InputComp
							{errors}
							bind:value={$form.email}
							name="email"
							label="Email address"
							type="email"
							autocomplete="email"
							labelClass=""
						/>
						<InputComp
							{errors}
							bind:value={$form.phone}
							name="phone"
							label="Phone number"
							type="tel"
							autocomplete="tel"
							labelClass=""
						/>
					</div>

					<div class="flex flex-col gap-2">
						<InputComp
							{errors}
							bind:value={$form.message}
							name="message"
							label="Your message"
							type="textarea"
							rows={4}
							maxlength={MAX_CONTACT_MESSAGE}
							labelClass=""
						/>
						<div class="flex items-start justify-between gap-3">
							<p class="text-sm text-muted-foreground">
								A sentence or two is plenty. We will reply and take it from there.
							</p>
							<span class="shrink-0 text-sm text-muted-foreground tabular-nums">
								{$form.message?.length ?? 0}/{MAX_CONTACT_MESSAGE}
							</span>
						</div>
					</div>

					<ChoiceGroup
						{errors}
						bind:value={$form.preferredChannel}
						name="preferredChannel"
						label="How should we reply?"
						options={[
							{ value: 'either', name: 'Either is fine' },
							{ value: 'email', name: 'By email' },
							{ value: 'phone', name: 'By phone' }
						]}
					/>

					<CheckboxField bind:checked={$form.joinNewsletter} name="joinNewsletter">
						Send me occasional news from the Foundation. Separate from a reply to this message, and
						you can unsubscribe from any of them.
					</CheckboxField>

					<div
						class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"
					>
						<p class="text-sm text-muted-foreground">
							{chosenSubject?.publicResponseNote ?? 'We read everything that arrives here.'}
						</p>
						<Button type="submit" size="lg" disabled={$delayed}>
							{#if $delayed}
								<LoadingBtn name="Sending" />
							{:else}
								Send message
							{/if}
						</Button>
					</div>
				</form>
			</Card.Root>
		{/if}
	</div>

	<!-- The other ways to reach the Foundation. Offices are rows; the settings
	     keys stay as the fallback for a site with none. -->
	<div class="order-1 flex min-w-0 flex-col gap-5 lg:order-2">
		{#each data.catalog.offices as office (office.id)}
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">{office.name}</h2>
				<dl class="flex flex-col gap-3 text-sm">
					{#if office.addressLine || office.city}
						<div class="flex items-start gap-3">
							<MapPin class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							<dd>
								{[office.addressLine, office.city, office.regionName].filter(Boolean).join(', ')}
								{#if office.mapUrl}
									<a
										href={office.mapUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="mt-1 block text-xs underline underline-offset-2"
									>
										Open in maps
									</a>
								{/if}
							</dd>
						</div>
					{/if}
					{#if office.phone}
						<div class="flex items-start gap-3">
							<Phone class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							<dd><a href={`tel:${office.phone}`} class="hover:text-primary">{office.phone}</a></dd>
						</div>
					{/if}
					{#if office.email}
						<div class="flex items-start gap-3">
							<Mail class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							<dd>
								<a href={`mailto:${office.email}`} class="hover:text-primary">{office.email}</a>
							</dd>
						</div>
					{/if}
					{#if office.openingHours}
						<div class="flex items-start gap-3">
							<Clock class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							<dd>{office.openingHours}</dd>
						</div>
					{/if}
				</dl>
			</Card.Root>
		{/each}

		{#if showSettingsFallback}
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-lg font-semibold">Reach us</h2>
				<dl class="flex flex-col gap-3 text-sm">
					{#if setting('contact.address')}
						<div class="flex items-start gap-3">
							<MapPin class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							<dd>{setting('contact.address')}</dd>
						</div>
					{/if}
					{#each [setting('contact.phone_1'), setting('contact.phone_2')].filter(Boolean) as phone (phone)}
						<div class="flex items-start gap-3">
							<Phone class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							<dd><a href={`tel:${phone}`} class="hover:text-primary">{phone}</a></dd>
						</div>
					{/each}
					{#each [setting('contact.email_primary'), setting('contact.email_secondary')].filter(Boolean) as email (email)}
						<div class="flex items-start gap-3">
							<Mail class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							<dd><a href={`mailto:${email}`} class="hover:text-primary">{email}</a></dd>
						</div>
					{/each}
					{#if setting('contact.office_hours')}
						<div class="flex items-start gap-3">
							<Clock class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							<dd>{setting('contact.office_hours')}</dd>
						</div>
					{/if}
				</dl>
			</Card.Root>
		{/if}

		{#if socials.length}
			<Card.Root class="p-6">
				<h2 class="mb-4 font-heading text-base font-semibold">Elsewhere</h2>
				<div class="flex flex-wrap gap-3">
					{#each socials as link (link.network)}
						<a
							href={link.url}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={link.network}
							class="rounded-full border p-3 transition hover:border-primary hover:text-primary"
						>
							<SocialIcon platform={link.network} class="size-4" />
						</a>
					{/each}
				</div>
			</Card.Root>
		{/if}
	</div>
</div>
