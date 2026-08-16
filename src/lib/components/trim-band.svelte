<script lang="ts">
	import { reveal } from '$lib/actions/reveal';
	import { cn } from '$lib/utils';

	/**
	 * The Foundation's one recurring ornament — a woven-look band of triangles,
	 * the way a tibeb border runs along the edge of a shawl. Pure CSS (see
	 * `.trim-band` in `layout.css`), so it never blurs and costs nothing to
	 * render. Used as a section divider and as the top edge of a few cards.
	 */
	let {
		thin = false,
		class: className = ''
	}: {
		thin?: boolean;
		class?: string;
	} = $props();
</script>

<div
	use:reveal={{ x: -32, duration: 700, blur: 2 }}
	class={cn('trim-band', thin && 'trim-band--thin', className)}
	aria-hidden="true"
></div>
