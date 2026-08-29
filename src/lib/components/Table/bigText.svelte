<script lang="ts">
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';

	/**
	 * A long value in a narrow column.
	 *
	 * It used to cut the text at ten characters in JavaScript and sit in a
	 * fixed `w-32` box, which meant a link column read "https://ww…" however
	 * much room the table had, and widening the column did nothing at all —
	 * the one thing somebody drags a column divider to achieve.
	 *
	 * The cut is CSS now, against the column's own width, so the column gets
	 * the last word: drag it wider and more of the value appears. The width
	 * has to be a pixel value rather than a percentage, or the untruncated
	 * string would still be what the browser sizes the column from and a long
	 * note would push the table off the screen.
	 */
	const { text, width = 150 }: { text: string; width?: number } = $props();

	const value = $derived(String(text ?? '').trim());
</script>

<div class="min-w-0" style="max-width:{width}px">
	<Popover>
		<PopoverTrigger class="block w-full truncate text-left" title={value}>
			{value || '-'}
		</PopoverTrigger>
		<PopoverContent class="max-w-sm p-3 text-sm wrap-break-word">
			{value || '-'}
		</PopoverContent>
	</Popover>
</div>
