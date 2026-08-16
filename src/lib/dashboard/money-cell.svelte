<script lang="ts">
	import { formatMoney } from '$lib/money';

	/**
	 * A money cell for the data tables. Amounts are stored in minor units, so a
	 * raw column render would show 150000 where the reader expects ETB 1,500.00.
	 */
	let { amount, currency = 'ETB' }: { amount: number; currency?: string } = $props();
</script>

<span class="font-medium whitespace-nowrap">{formatMoney(amount, currency)}</span>
