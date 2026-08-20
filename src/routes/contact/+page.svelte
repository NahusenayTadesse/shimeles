<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import PageHero from '$lib/content/PageHero.svelte';
	import BlockRenderer from '$lib/content/BlockRenderer.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import Errors from '$lib/formComponents/Errors.svelte';
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

<svelte:head>
	<title
		>{data.page?.title ?? 'Contact'} · {data.settings?.['site.name'] ??
			'Shimeles Abera Foundation'}</title
	>
	{#if data.page?.metaDescription}
		<meta name="description" content={data.page.metaDescription} />
	{/if}
</svelte:head>

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
							<Label>What is this about?</Label>
							<div class="flex flex-wrap gap-2">
								{#each data.catalog.subjects as subject (subject.id)}
									<Button
										type="button"
										size="sm"
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
										the faster route — it reaches the team that can actually help.
									</span>
								</a>
							{/if}
						</div>
					{/if}

					<div class="grid gap-5 md:grid-cols-2">
						<div class="flex flex-col gap-2">
							<Label for="fullName">Your name</Label>
							<Input
								id="fullName"
								name="fullName"
								bind:value={$form.fullName}
								autocomplete="name"
							/>
							{#if $errors.fullName}<p class="text-sm text-destructive">{$errors.fullName}</p>{/if}
						</div>

						<div class="flex flex-col gap-2">
							<Label for="organization">Organisation, if any</Label>
							<Input
								id="organization"
								name="organization"
								bind:value={$form.organization}
								autocomplete="organization"
							/>
						</div>

						<div class="flex flex-col gap-2">
							<Label for="email">Email address</Label>
							<Input
								id="email"
								name="email"
								type="email"
								bind:value={$form.email}
								autocomplete="email"
							/>
							{#if $errors.email}<p class="text-sm text-destructive">{$errors.email}</p>{/if}
						</div>

						<div class="flex flex-col gap-2">
							<Label for="phone">Phone number</Label>
							<Input
								id="phone"
								name="phone"
								type="tel"
								bind:value={$form.phone}
								autocomplete="tel"
							/>
							{#if $errors.phone}<p class="text-sm text-destructive">{$errors.phone}</p>{/if}
						</div>
					</div>

					<div class="flex flex-col gap-2">
						<Label for="message">Your message</Label>
						<Textarea id="message" name="message" rows={6} bind:value={$form.message} />
						{#if $errors.message}<p class="text-sm text-destructive">{$errors.message}</p>{/if}
					</div>

					<div class="flex flex-col gap-2">
						<Label>How should we reply?</Label>
						<div class="flex flex-wrap gap-2">
							{#each [{ value: 'either', name: 'Either is fine' }, { value: 'email', name: 'By email' }, { value: 'phone', name: 'By phone' }] as option (option.value)}
								<Button
									type="button"
									size="sm"
									variant={$form.preferredChannel === option.value ? 'default' : 'outline'}
									onclick={() =>
										($form.preferredChannel = option.value as typeof $form.preferredChannel)}
								>
									{option.name}
								</Button>
							{/each}
						</div>
						<input type="hidden" name="preferredChannel" value={$form.preferredChannel} />
					</div>

					<label class="flex items-start gap-3">
						<Checkbox
							checked={$form.joinNewsletter}
							onCheckedChange={(checked) => ($form.joinNewsletter = checked === true)}
							class="mt-0.5"
						/>
						<span class="text-sm">
							Send me occasional news from the Foundation. Separate from a reply to this message,
							and you can unsubscribe from any of them.
						</span>
					</label>
					<input type="hidden" name="joinNewsletter" value={String($form.joinNewsletter)} />

					<Separator />

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
