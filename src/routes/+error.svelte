<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import HeartHandshakeIcon from '@lucide/svelte/icons/heart-handshake';
	import MailIcon from '@lucide/svelte/icons/mail';

	/**
	 * The public error page.
	 *
	 * Someone reaching this is almost always following an old link to a service
	 * — a shared WhatsApp message, a printed flyer, a search result for a page
	 * that has been renamed. SvelteKit's built-in page gives them a status code
	 * on a white background and no way onwards, which for a person looking for
	 * help is a dead end at exactly the wrong moment. So this offers the three
	 * things they were probably after: the programmes, applying, and a way to
	 * reach a human.
	 */

	const isNotFound = $derived(page.status === 404);

	const heading = $derived(
		isNotFound ? 'We could not find that page' : 'Something went wrong on our side'
	);

	const explanation = $derived(
		isNotFound
			? 'The link may be old, or the page may have moved. Nothing you did caused this.'
			: 'This is our fault, not yours. Please try again in a moment, and if you were part-way through a form, do not close the tab.'
	);
</script>

<svelte:head>
	<title>{heading} · Shimeles Abera Foundation</title>
</svelte:head>

<section class="mx-auto w-full max-w-2xl px-4 py-20 sm:py-28">
	<p class="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
		Error {page.status}
	</p>
	<h1 class="mt-3 font-heading text-3xl font-bold sm:text-4xl">{heading}</h1>
	<p class="mt-4 text-base text-muted-foreground">{explanation}</p>

	<!-- The server's own message, when it wrote one worth reading. SvelteKit
	     fills `message` with "Not Found" / "Internal Error" for the generic
	     cases, which the heading above already says better. -->
	{#if page.error?.message && !['Not Found', 'Internal Error'].includes(page.error.message)}
		<p class="mt-4 rounded-lg border border-border bg-muted/40 p-4 text-sm">
			{page.error.message}
		</p>
	{/if}

	<div class="mt-8 flex flex-wrap gap-3">
		<Button href="/">
			<ArrowLeftIcon class="size-4" />
			Back to the homepage
		</Button>
		<Button href="/apply" variant="outline">
			<HeartHandshakeIcon class="size-4" />
			Apply for assistance
		</Button>
		<Button href="/contact" variant="outline">
			<MailIcon class="size-4" />
			Contact us
		</Button>
	</div>

	<p class="mt-10 text-sm text-muted-foreground">
		Looking for something specific? The <a class="underline" href="/programs">programmes</a>,
		<a class="underline" href="/volunteer">volunteering</a>
		and <a class="underline" href="/donate">donating</a> pages are the most common destinations.
	</p>
</section>
