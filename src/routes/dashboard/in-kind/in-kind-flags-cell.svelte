<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Snowflake, Sparkle, Timer, Truck, TriangleAlert } from '@lucide/svelte';
	import { formatDateShort } from '$lib/dates';

	/**
	 * The things about an offer that change what someone does next.
	 *
	 * Deliberately not a column each: five mostly-empty columns read as noise,
	 * and what a coordinator scanning the queue needs is "is there anything
	 * unusual about this one" — a row with no badges needs no thought.
	 */
	let {
		isPerishable,
		needsColdStorage,
		hasRestrictedItems,
		requiresVehicle,
		expiresOn,
		scheduledFor,
		isRead,
		today
	}: {
		isPerishable: boolean;
		needsColdStorage: boolean;
		hasRestrictedItems: boolean;
		requiresVehicle: boolean;
		expiresOn: string | null;
		scheduledFor: string | null;
		isRead: boolean;
		today: string;
	} = $props();

	/** String compare is safe and cheap: both sides are ISO `YYYY-MM-DD`. */
	/** Pure: builds a new date rather than mutating one, which the linter and
	    the next reader both prefer. */
	const addDays = (iso: string, days: number) =>
		new Date(new Date(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10);

	const overdue = $derived(Boolean(scheduledFor) && scheduledFor! <= today);
	const expiringSoon = $derived(Boolean(expiresOn) && expiresOn! <= addDays(today, 30));

	const shortDate = (value: string) => formatDateShort(value, '');
</script>

<div class="flex flex-wrap items-center gap-1">
	{#if !isRead}
		<Badge variant="default" class="gap-1">
			<Sparkle class="size-3" /> Unopened
		</Badge>
	{/if}

	{#if overdue}
		<Badge variant="destructive" class="gap-1">
			<Timer class="size-3" /> Due {shortDate(scheduledFor!)}
		</Badge>
	{:else if scheduledFor}
		<Badge variant="outline" class="gap-1">
			<Timer class="size-3" />
			{shortDate(scheduledFor)}
		</Badge>
	{/if}

	{#if expiringSoon}
		<Badge variant="destructive" class="gap-1">Use by {shortDate(expiresOn!)}</Badge>
	{:else if isPerishable}
		<Badge variant="secondary">Perishable</Badge>
	{/if}

	{#if needsColdStorage}
		<Badge variant="secondary" class="gap-1">
			<Snowflake class="size-3" /> Cold
		</Badge>
	{/if}

	{#if hasRestrictedItems}
		<Badge variant="destructive" class="gap-1">
			<TriangleAlert class="size-3" /> Restricted
		</Badge>
	{/if}

	{#if requiresVehicle}
		<Badge variant="outline" class="gap-1">
			<Truck class="size-3" /> Vehicle
		</Badge>
	{/if}
</div>
