<script lang="ts" module>
	/**
	 * Badge colours for workflow statuses.
	 *
	 * `status_options.color` is a dashboard-editable token, not a CSS class —
	 * staff pick "olive" from a dropdown and never type Tailwind. The mapping
	 * from token to classes lives here, so an unknown token degrades to a neutral
	 * badge instead of rendering an unstyled one.
	 */
	const TOKENS: Record<string, string> = {
		slate: 'bg-muted text-muted-foreground border-border',
		clay: 'bg-clay/12 text-clay border-clay/30',
		olive: 'bg-olive/12 text-olive border-olive/30',
		plum: 'bg-plum/12 text-plum border-plum/30',
		sky: 'bg-sky/12 text-sky border-sky/30',
		amber: 'bg-warning/12 text-warning border-warning/30',
		rose: 'bg-destructive/12 text-destructive border-destructive/30',
		green: 'bg-success/12 text-success border-success/30'
	};

	export const statusColors = Object.keys(TOKENS);
	export const statusColorItems = statusColors.map((value) => ({ value, name: value }));
</script>

<script lang="ts">
	import { cn } from '$lib/utils';

	let {
		label,
		color = 'slate',
		class: className = ''
	}: { label?: string | null; color?: string | null; class?: string } = $props();

	const classes = $derived(TOKENS[color ?? 'slate'] ?? TOKENS.slate);
</script>

<span
	class={cn(
		'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
		classes,
		className
	)}
>
	{label ?? 'No status'}
</span>
