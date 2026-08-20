<script lang="ts">
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { assetUrl } from '$lib/assets';
	import { PAYPAL_ACTION } from '$lib/donations';
	import { ArrowUpRight, ChevronDown, CreditCard, Info, Play } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import VideoCarousel from '$lib/content/VideoCarousel.svelte';
	import { cn } from '$lib/utils';
	import type { RenderDonationCampaign } from '$lib/content/types';

	/**
	 * Giving through an outside platform — PayPal, Zeffy, whatever comes next.
	 *
	 * A PayPal entry renders PayPal's own form, because that is what puts the
	 * donor on a checkout with the campaign already selected. What it does *not*
	 * render is PayPal's markup: staff paste a link, the `campaign_id` is parsed
	 * out of it, and the form around that hidden input is ours — so the button
	 * is a real button in the site's type and colours rather than a fixed-width
	 * GIF from 2009, and nobody has to paste HTML into a database field.
	 *
	 * Everything else is an ordinary outbound link.
	 */
	let {
		campaigns = [],
		/** Videos per campaign id, from `getMediaByOwner('campaign', …)`. */
		videos = {},
		heading = 'Give by card',
		description = '',
		class: className = ''
	}: {
		campaigns?: RenderDonationCampaign[];
		videos?: Record<number, { id: number; youtubeUrl: string; caption: string | null }[]>;
		heading?: string;
		description?: string;
		class?: string;
	} = $props();

	/**
	 * Which campaign's appeal is expanded.
	 *
	 * Collapsed by default, and the player is only mounted once opened. These
	 * cards live in a narrow column whose job is the Give button; an embed
	 * sitting open under each one would push that button below the fold and
	 * would call YouTube on every page load for a video most donors will not
	 * watch. One at a time, so opening a second closes the first.
	 */
	let openVideo = $state<number | null>(null);

	const label = (campaign: RenderDonationCampaign) =>
		campaign.buttonLabel || `Give with ${campaign.companyName}`;

	const audienceLabel: Record<string, string> = {
		diaspora: 'From outside Ethiopia',
		local: 'Inside Ethiopia'
	};
</script>

{#if campaigns.length}
	<section class={cn('flex flex-col gap-4', className)}>
		<div class="flex flex-col gap-1">
			<h2 class="flex items-center gap-2 font-heading text-lg font-semibold">
				<CreditCard class="size-5 text-primary" />
				{heading}
			</h2>
			{#if description}
				<p class="text-sm text-muted-foreground">{description}</p>
			{/if}
		</div>

		<div class="flex flex-col gap-3">
			{#each campaigns as campaign (campaign.id)}
				<div
					class={cn(
						'flex flex-col gap-3 rounded-xl border p-4',
						campaign.isFeatured ? 'border-primary/40 bg-primary/5' : 'bg-card'
					)}
				>
					<div class="flex items-start justify-between gap-3">
						<div class="flex min-w-0 items-center gap-3">
							{#if campaign.companyLogo}
								<img
									src={assetUrl(campaign.companyLogo)}
									alt={campaign.companyName}
									loading="lazy"
									class="h-7 w-auto max-w-24 object-contain"
								/>
							{:else}
								<span class="font-heading text-sm font-semibold">{campaign.companyName}</span>
							{/if}
						</div>

						<div class="flex shrink-0 items-center gap-1.5">
							{#if audienceLabel[campaign.audience]}
								<Badge variant="secondary" class="text-[10px]">
									{audienceLabel[campaign.audience]}
								</Badge>
							{/if}
							<Badge variant="outline" class="text-[10px]">{campaign.currency}</Badge>
						</div>
					</div>

					<div class="flex flex-col gap-1">
						<p class="font-medium">{campaign.name}</p>
						{#if campaign.description}
							<p class="text-sm text-muted-foreground">{campaign.description}</p>
						{/if}
					</div>

					{#if campaign.paypal}
						<!--
							PayPal's form, our markup. `target="_top"` is PayPal's own
							requirement — it breaks the donor out of any frame the page is
							sitting in, so the checkout is never rendered inside someone
							else's chrome.
						-->
						<form action={PAYPAL_ACTION} method="post" target="_top" class="contents">
							<input type="hidden" name={campaign.paypal.param} value={campaign.paypal.value} />
							<button
								type="submit"
								class={cn(
									buttonVariants({
										variant: campaign.isFeatured ? 'default' : 'outline',
										size: 'lg'
									}),
									'w-full'
								)}
							>
								{label(campaign)}
								<ArrowUpRight class="size-4" />
							</button>
						</form>
					{:else}
						<a
							href={campaign.url}
							target="_blank"
							rel="noreferrer noopener"
							class={cn(
								buttonVariants({
									variant: campaign.isFeatured ? 'default' : 'outline',
									size: 'lg'
								}),
								'w-full'
							)}
						>
							{label(campaign)}
							<ArrowUpRight class="size-4" />
						</a>
					{/if}

					{#if videos[campaign.id]?.length}
						{@const clips = videos[campaign.id]}
						{@const isOpen = openVideo === campaign.id}
						<div class="flex flex-col gap-3">
							<button
								type="button"
								onclick={() => (openVideo = isOpen ? null : campaign.id)}
								aria-expanded={isOpen}
								class="group flex w-full items-center gap-2.5 rounded-lg border border-dashed px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
							>
								<span
									class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110"
								>
									<Play class="size-3.5" fill="currentColor" />
								</span>
								<span class="min-w-0 flex-1 truncate font-medium">
									{clips[0].caption || `Why we work with ${campaign.companyName}`}
								</span>
								<ChevronDown
									class="size-4 shrink-0 text-muted-foreground transition-transform duration-200 {isOpen
										? 'rotate-180'
										: ''}"
								/>
							</button>

							{#if isOpen}
								<div transition:slide={{ duration: 220 }}>
									<!-- The first clip's caption is already the toggle's label, so
									     it is blanked here rather than repeated under the player.
									     Later clips still need naming. -->
									<VideoCarousel
										videos={clips.map((clip, clipIndex) => ({
											...clip,
											caption: clipIndex === 0 ? null : clip.caption
										}))}
										title={campaign.name}
									/>
								</div>
							{/if}
						</div>
					{/if}

					{#if campaign.note}
						<p class="flex items-start gap-1.5 text-xs text-muted-foreground">
							<Info class="mt-0.5 size-3 shrink-0" />
							{campaign.note}
						</p>
					{/if}
				</div>
			{/each}
		</div>

		<Separator />

		<!--
			Said plainly, because it is true and because a donor who expects a
			reference number and does not get one will email to ask where it is:
			these platforms confirm the gift themselves.
		-->
		<p class="text-xs text-muted-foreground">
			These take you to the platform to complete your gift. They will send you their own receipt —
			you will not need a reference number from us.
		</p>
	</section>
{/if}
