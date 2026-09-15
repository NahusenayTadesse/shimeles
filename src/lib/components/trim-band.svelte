<script lang="ts">
	import { cn } from '$lib/utils';

	/**
	 * The Foundation's one recurring ornament — a woven-look band of triangles,
	 * the way a tibeb border runs along the edge of a shawl. Pure CSS (see
	 * `.trim-band` in `layout.css`), so it never blurs and costs nothing to
	 * render. Used as a section divider and as the top edge of a few cards.
	 *
	 * `festive` is the full-width border rather than the hairline: gold and
	 * forest triangles meeting on a row of terracotta diamonds, the pattern a
	 * holiday shawl carries along its hem. An inline SVG pattern rather than CSS
	 * gradients, because diamonds do not tile cleanly out of gradients. Kept for
	 * the few places that mark a change of section, never on a card.
	 */
	let {
		thin = false,
		festive = false,
		class: className = ''
	}: {
		thin?: boolean;
		festive?: boolean;
		class?: string;
	} = $props();

	const id = $props.id();
</script>

{#if festive}
	<div class={cn('h-7 w-full overflow-hidden', className)} aria-hidden="true">
		<svg class="block size-full">
			<defs>
				<pattern id="tibeb-{id}" width="28" height="28" patternUnits="userSpaceOnUse">
					<rect width="28" height="28" style:fill="var(--sand)" />
					<rect width="28" height="2" style:fill="var(--olive)" />
					<polygon points="0,2 14,10 28,2" style:fill="var(--olive)" />
					<polygon points="14,11 17.5,14 14,17 10.5,14" style:fill="var(--terracotta)" />
					<polygon points="0,11 3.5,14 0,17" style:fill="var(--olive)" />
					<polygon points="28,11 24.5,14 28,17" style:fill="var(--olive)" />
					<polygon points="0,26 14,18 28,26" style:fill="var(--clay)" />
					<rect y="26" width="28" height="2" style:fill="var(--olive)" />
				</pattern>
			</defs>
			<rect width="100%" height="100%" fill="url(#tibeb-{id})" />
		</svg>
	</div>
{:else}
	<div class={cn('trim-band', thin && 'trim-band--thin', className)} aria-hidden="true"></div>
{/if}
