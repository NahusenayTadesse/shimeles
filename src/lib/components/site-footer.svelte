<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Mail, MapPin, Phone } from '@lucide/svelte';
	import SocialIcon, { socialPlatforms } from '$lib/components/social-icon.svelte';
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
			{ key: 'contact.email_secondary', icon: Mail, href: (v: string) => `mailto:${v}` },
			{ key: 'contact.address', icon: MapPin, href: () => '' }
		].filter((contact) => s(contact.key))
	);

	let subscribing = $state(false);
</script>

<footer class="on-forest forest-glow mt-24">
	<div class="wrap pt-20 pb-10">
		<!-- The last thing on every page is who this is, said once.
		     `logo.png` is the full lockup — the emblem, the name in English and
		     Amharic, and the tagline in both — so setting the name beside it in
		     the serif said all of it twice and the tagline three times. Its flat
		     `--forest` rectangle also showed as a pasted box against this band,
		     whose `.forest-glow` carries gold in the corners.
		     So the footer speaks the header's language instead: the round emblem
		     (`mark.png`, cut from the lockup by `npm run logo:mark`, transparent
		     outside the circle) and the name in type beside it. The emblem is
		     `alt=""` because the name is right there in text. -->
		<div
			class="flex flex-col items-start gap-6 border-b border-(--honey)/15 pb-14 sm:flex-row sm:items-center sm:gap-7"
		>
			<img
				src="/mark.png"
				alt=""
				width="226"
				height="226"
				loading="lazy"
				decoding="async"
				class="size-20 shrink-0 rounded-full object-contain ring-1 ring-(--gold)/60 md:size-24"
			/>
			<div class="flex flex-col gap-2">
				<p
					class="max-w-2xl font-serif text-[clamp(1.9rem,1.1rem+2.4vw,3.4rem)] leading-[1.1] font-bold text-[#f6f3e6]"
				>
					{s('site.name') || 'Shimeles Abera Foundation'}
				</p>
				{#if s('site.tagline')}
					<p class="font-serif text-lg text-(--gold)">{s('site.tagline')}</p>
				{/if}
			</div>
		</div>

		<div class="grid gap-12 pt-12 md:grid-cols-[1.4fr_1fr_1.2fr]">
			<div class="flex flex-col gap-5">
				{#if s('footer.blurb')}
					<p class="max-w-md text-(--honey)/85">{s('footer.blurb')}</p>
				{/if}
				{#if socials.length}
					<div class="flex gap-2">
						{#each socials as social (social.platform)}
							<a
								href={social.url}
								target="_blank"
								rel="noreferrer noopener"
								aria-label={social.platform}
								class="flex size-10 items-center justify-center rounded-full border border-(--honey)/25 text-(--honey) transition-colors hover:border-(--gold) hover:text-(--gold)"
							>
								<SocialIcon platform={social.platform} />
							</a>
						{/each}
					</div>
				{/if}
			</div>

			{#if items.length}
				<nav class="flex flex-col gap-3" aria-label={s('footer.links_heading') || 'Explore'}>
					<p class="font-serif text-xl font-bold text-[#f6f3e6]">
						{s('footer.links_heading') || 'Explore'}
					</p>
					<ul class="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-1">
						{#each items as item (item.id)}
							<li>
								<a
									href={item.href}
									class="text-(--honey)/85 transition-colors hover:text-[#f6f3e6]"
								>
									{item.label}
								</a>
							</li>
						{/each}
					</ul>
				</nav>
			{/if}

			<div class="flex flex-col gap-3">
				<p class="font-serif text-xl font-bold text-[#f6f3e6]">
					{s('footer.contact_heading') || 'Get in touch'}
				</p>
				{#each contacts as contact (contact.key)}
					{@const Icon = contact.icon}
					{@const value = s(contact.key)}
					{@const href = contact.href(value)}
					<div class="flex items-start gap-2.5 text-(--honey)/85">
						<Icon class="mt-1 size-4 shrink-0 text-(--gold)" />
						{#if href}
							<a {href} class="break-all transition-colors hover:text-[#f6f3e6]">{value}</a>
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
					class="mt-4 flex flex-col gap-2"
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
					<label for="footer-newsletter" class="text-(--honey)/85">
						{s('footer.newsletter_label') || 'News from the Foundation, now and then'}
					</label>
					<div class="flex gap-2">
						<Input
							id="footer-newsletter"
							type="email"
							name="email"
							required
							placeholder={s('footer.newsletter_placeholder') || 'Your email'}
							class="h-11 rounded-full border-(--honey)/25 bg-white/5 text-[#f6f3e6] placeholder:text-(--honey)/50 focus-visible:border-(--gold)"
						/>
						<Button
							type="submit"
							disabled={subscribing}
							class="btn-gold h-11 shrink-0 rounded-full px-5"
						>
							Subscribe
						</Button>
					</div>
				</form>
			</div>
		</div>
	</div>

	<div class="border-t border-(--honey)/15">
		<div
			class="wrap flex flex-col gap-2 py-6 text-sm text-(--honey)/85 sm:flex-row sm:justify-between"
		>
			<p>
				© {new Date().getFullYear()}
				{s('site.name') || 'Shimeles Abera Foundation'}. {s('footer.rights') ||
					'All rights reserved.'}
			</p>
			<p>{s('footer.registration') || ''}</p>
			<p>
				Developed by <a
					target="_blank"
					rel="noopener"
					href="https://nahusenaytadesse.vercel.app"
					class="link-quiet">NT</a
				>
			</p>
		</div>
	</div>
</footer>
