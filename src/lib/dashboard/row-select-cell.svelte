<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';

	/**
	 * The tick box in a table row (or in its header, for select-all).
	 *
	 * TanStack already tracked selection and `DataTable` already published it
	 * through `bind:selected`; there was simply no control anywhere that let a
	 * person select anything. This is that control.
	 */
	let {
		checked,
		indeterminate = false,
		label,
		onCheckedChange
	}: {
		checked: boolean;
		indeterminate?: boolean;
		label: string;
		onCheckedChange: (value: boolean) => void;
	} = $props();
</script>

<Checkbox
	{checked}
	{indeterminate}
	aria-label={label}
	onCheckedChange={(value) => onCheckedChange(value === true)}
/>
