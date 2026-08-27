<script lang="ts">
	import { formatMoney, type MoneyTotal } from '$lib/money';

	/**
	 * A total that may be in more than one currency.
	 *
	 * Birr and dollars are counted separately everywhere (see `MoneyTotal` in
	 * `$lib/money.ts`), so a headline figure is a list, not a number. One
	 * currency renders exactly as it always did; two or more stack, because a
	 * single line reading "ETB 1,500.00 + USD 200.00" invites the reader to add
	 * them, which is the thing that must not happen.
	 *
	 * `empty` names the currency the zero is in when nothing has come in yet —
	 * a blank where a total belongs reads as a broken screen.
	 */
	let {
		totals,
		empty = 'ETB',
		class: className = ''
	}: { totals: readonly MoneyTotal[]; empty?: string; class?: string } = $props();

	const shown = $derived(totals.length ? totals : [{ currency: empty, amount: 0 }]);
</script>

<span class="flex flex-col whitespace-nowrap tabular-nums {className}">
	{#each shown as total (total.currency)}
		<span>{formatMoney(total.amount, total.currency)}</span>
	{/each}
</span>
