<script lang="ts">
	import { ArrowRight } from '@lucide/svelte';

	/**
	 * The seasonal greeting under the public header — `season.*` in Site
	 * settings. Renders only when it is switched on *and* has words, so a staff
	 * member who turns it on before typing the message publishes nothing rather
	 * than an empty gold strip.
	 *
	 * The flowers either side are adey abeba, the yellow Meskel daisy that comes
	 * out across the highlands at the New Year — the season's own emblem, drawn
	 * inline so it costs no request.
	 */
	let { enabled, message, href }: { enabled: boolean; message: string; href?: string | null } =
		$props();
</script>

{#snippet flower(className: string)}
	<svg viewBox="0 0 24 24" class={className} aria-hidden="true">
		{#each [0, 45, 90, 135, 180, 225, 270, 315] as angle (angle)}
			<ellipse
				cx="12"
				cy="5.2"
				rx="2.3"
				ry="4.4"
				transform="rotate({angle} 12 12)"
				style:fill="oklch(0.93 0.13 95)"
			/>
		{/each}
		<circle cx="12" cy="12" r="3.2" style:fill="var(--terracotta)" />
	</svg>
{/snippet}

{#if enabled && message.trim()}
	<div class="gold-surface relative z-30 w-full border-b border-(--on-gold)/10">
		<div
			class="mx-auto flex w-full max-w-6xl items-center justify-center gap-3 px-4 py-2.5 text-center text-sm font-semibold"
		>
			{@render flower('size-5 shrink-0 season-flower')}
			{#if href}
				<a {href} class="group inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
					{message}
					<ArrowRight class="size-3.5 transition-transform group-hover:translate-x-0.5" />
				</a>
			{:else}
				<p>{message}</p>
			{/if}
			{@render flower('hidden size-5 shrink-0 season-flower sm:block')}
		</div>
	</div>
{/if}

<style>
	:global(.season-flower) {
		animation: season-turn 14s linear infinite;
		filter: drop-shadow(0 1px 1px oklch(0.4 0.08 80 / 35%));
	}

	@keyframes season-turn {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.season-flower) {
			animation: none;
		}
	}
</style>
