<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Mail, MapPin, Phone, Send } from '@lucide/svelte';
	import SocialIcon, { socialPlatforms } from '$lib/components/social-icon.svelte';
	import TrimBand from '$lib/components/trim-band.svelte';
	import { reveal, stagger } from '$lib/actions/reveal';
	import { toast } from 'svelte-sonner';
	import type { RenderNavItem } from '$lib/content/types';

	/**
	 * The public footer.
	 *
	 * Contact details, social links and footer copy all come from
	 * `site_settings`; the links come from `navigation_items` with a `footer`
	 * placement. Nothing here is a string literal that staff might want to
	 * change — a new phone number is a settings edit, not a deploy (§0).
	 */
	let {
		items = [],
		settings = {}
	}: {
		items?: RenderNavItem[];
		settings?: Record<string, string>;
	} = $props();

	const s = (key: string) => settings[key] ?? '';

	/**
	 * Only the socials that have actually been filled in get a button. The list
	 * is derived from the platforms `social-icon` can draw crossed with the
	 * `social.*` settings that hold a value, so adding LinkedIn next year is a
	 * settings row rather than an edit here.
	 */
	const socials = $derived(
		socialPlatforms
			.map((platform) => ({ platform, url: s(`social.${platform}`) }))
			.filter((social) => social.url)
	);

	const contacts = $derived(
		[
			{ key: 'contact.phone_1', icon: Phone, href: (v: string) => `tel:${v.replace(/\s/g, '')}` },
			{ key: 'contact.phone_2', icon: Phone, href: (v: string) => `tel:${v.replace(/\s/g, '')}` },
			{ key: 'contact.email_primary', icon: Mail, href: (v: string) => `mailto:${v}` },
			{ key: 'contact.address', icon: MapPin, href: () => '' }
		].filter((contact) => s(contact.key))
	);

	let subscribing = $state(false);
</script>

<footer class="relative mt-32 overflow-hidden bg-clay-deep text-[oklch(0.94_0.012_80)]">
	<TrimBand class="absolute top-0 left-0 w-full" />
	<div
		class="pointer-events-none absolute -top-40 right-[-10%] size-96 rounded-full bg-olive/10 blur-3xl"
		aria-hidden="true"
	></div>

	<div class="relative mx-auto grid w-full max-w-6xl gap-10 px-4 pt-16 pb-10 md:grid-cols-4">
		<div use:reveal class="flex flex-col gap-4 md:col-span-2">
			<div class="flex items-center gap-2.5">
				<img src="/logo.png" alt="" class="h-20 w-auto shrink-0 rounded-full object-contain" />
				<!-- <p class="font-heading text-xl font-semibold">
					{s('site.name') || 'Shimeles Abera Foundation'}
				</p> -->
			</div>
			{#if s('footer.blurb')}
				<p class="max-w-md text-sm text-[oklch(0.94_0.012_80)]/70">{s('footer.blurb')}</p>
			{/if}

			{#if socials.length}
				<div class="mt-2 flex gap-2">
					{#each socials as social (social.platform)}
						<a
							href={social.url}
							target="_blank"
							rel="noreferrer noopener"
							aria-label={social.platform}
							class="flex size-9 items-center justify-center rounded-full border border-olive/30 text-[oklch(0.94_0.012_80)]/80 transition-colors hover:border-olive hover:bg-olive/10 hover:text-olive"
						>
							<SocialIcon platform={social.platform} />
						</a>
					{/each}
				</div>
			{/if}
		</div>

		{#if items.length}
			<nav use:reveal={{ delay: stagger(1, 80, 3) }} class="flex flex-col gap-2.5">
				<p class="eyebrow text-olive/90">{s('footer.links_heading') || 'Explore'}</p>
				{#each items as item (item.id)}
					<a
						href={item.href}
						class="w-fit text-sm text-[oklch(0.94_0.012_80)]/70 transition-colors hover:text-olive"
					>
						{item.label}
					</a>
				{/each}
			</nav>
		{/if}

		<div use:reveal={{ delay: stagger(2, 80, 3) }} class="flex flex-col gap-3">
			<p class="eyebrow text-olive/90">{s('footer.contact_heading') || 'Get in touch'}</p>
			{#each contacts as contact (contact.key)}
				{@const Icon = contact.icon}
				{@const value = s(contact.key)}
				{@const href = contact.href(value)}
				<div class="flex items-start gap-2 text-sm text-[oklch(0.94_0.012_80)]/70">
					<Icon class="mt-0.5 size-4 shrink-0 text-olive/80" />
					{#if href}
						<a {href} class="hover:text-olive">{value}</a>
					{:else}
						<span>{value}</span>
					{/if}
				</div>
			{/each}

			<!-- The newsletter signup posts to a root-level action, so it works from
			     any page the footer appears on. -->
			<form
				method="post"
				action="/?/subscribe"
				class="mt-2 flex gap-2"
				use:enhance={() => {
					subscribing = true;
					return async ({ result, update }) => {
						subscribing = false;
						if (result.type === 'success') toast.success('Thank you for subscribing.');
						if (result.type === 'failure') toast.error('That email address did not look right.');
						await update({ reset: true });
					};
				}}
			>
				<Input
					type="email"
					name="email"
					required
					placeholder={s('footer.newsletter_placeholder') || 'Your email'}
					class="h-10 rounded-full border-olive/25 bg-[oklch(0.94_0.012_80)]/5 text-[oklch(0.94_0.012_80)] placeholder:text-[oklch(0.94_0.012_80)]/40 focus-visible:border-olive"
				/>
				<Button
					type="submit"
					size="icon"
					disabled={subscribing}
					class="shrink-0 rounded-full bg-olive text-clay-deep hover:bg-olive-bright"
					aria-label="Join the newsletter"
				>
					<Send class="size-4" />
				</Button>
			</form>
		</div>
	</div>

	<div class="relative border-t border-olive/15">
		<div
			class="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-[oklch(0.94_0.012_80)]/50 sm:flex-row sm:justify-between"
		>
			<p>
				© {new Date().getFullYear()}
				{s('site.name') || 'Shimeles Abera Foundation'}. {s('footer.rights') ||
					'All rights reserved.'}
			</p>
			<p>{s('footer.registration') || ''}</p>
		</div>
		<p class="text-center mb-2 text-[8px] text-[oklch(0.94_0.012_80)]/50"> Developed By: <a target="_blank" href="https://nahusenaytadesse.vercel.app">NT</a></p>
	</div>
</footer>
