<script lang="ts">
	import { page as pageState } from '$app/state';
	import { applyFilters } from '$lib/dashboard/apply-filter';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { RangeCalendar } from '$lib/components/ui/range-calendar/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date';
	import type { DateRange } from 'bits-ui';
	import type { DateValue } from '@internationalized/date';
	import { CalendarIcon, X } from '@lucide/svelte';

	/**
	 * A date-range filter for a server-filtered list.
	 *
	 * Presets first, calendar second. "Last 30 days" is the question staff
	 * actually ask, and it should cost one click rather than two calendar
	 * journeys — the calendar is there for the once-a-quarter case where the
	 * range really is 3 March to 19 April.
	 *
	 * Writes `from` and `to` as `YYYY-MM-DD` into the URL, so the filter is
	 * shareable and the server does the narrowing. See `dateRangeFilter`.
	 */
	let {
		from,
		to,
		label = 'Any date',
		fromKey = 'from',
		toKey = 'to'
	}: {
		from: string;
		to: string;
		/** Shown on the trigger when no range is set, e.g. "Any publish date". */
		label?: string;
		fromKey?: string;
		toKey?: string;
	} = $props();

	let open = $state(false);

	const parse = (value: string) => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
		const [y, m, d] = value.split('-').map(Number);
		return new CalendarDate(y, m, d);
	};

	// Seeded from the URL each time the popover opens, so the back button and
	// the Clear button below are both reflected rather than shadowed by a draft.
	// `DateRange` from bits-ui declares both ends as present-but-possibly
	// undefined, so the type is borrowed rather than re-declared structurally.
	let value = $state<DateRange>({ start: parse(from), end: parse(to) });

	function onOpenChange(next: boolean) {
		open = next;
		if (next) value = { start: parse(from), end: parse(to) };
	}

	function apply(nextFrom: string, nextTo: string) {
		open = false;
		applyFilters(pageState.url, { [fromKey]: nextFrom, [toKey]: nextTo });
	}

	/**
	 * `toString()` on a `CalendarDate` is already `YYYY-MM-DD` in local terms.
	 * The calendar's value is typed as the wider `DateValue`, which a
	 * `CalendarDateTime` would also satisfy — slicing to ten characters keeps a
	 * date out of the URL whatever the calendar hands back.
	 */
	const iso = (date: DateValue | undefined) => date?.toString().slice(0, 10) ?? '';

	const presets = [
		{ label: 'Last 7 days', days: 7 },
		{ label: 'Last 30 days', days: 30 },
		{ label: 'Last 90 days', days: 90 },
		{ label: 'Last 12 months', days: 365 }
	];

	function applyPreset(days: number) {
		const now = today(getLocalTimeZone());
		apply(now.subtract({ days }).toString(), now.toString());
	}

	const fmt = (value: string) => {
		const date = parse(value);
		if (!date) return '';
		return new Intl.DateTimeFormat('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		}).format(date.toDate(getLocalTimeZone()));
	};

	const active = $derived(Boolean(from || to));

	const triggerLabel = $derived(
		!active
			? label
			: from && to
				? `${fmt(from)} – ${fmt(to)}`
				: from
					? `From ${fmt(from)}`
					: `Until ${fmt(to)}`
	);
</script>

<div class="flex items-center gap-1">
	<Popover.Root {open} {onOpenChange}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant={active ? 'default' : 'outline'} size="sm">
					<CalendarIcon class="size-4" />
					{triggerLabel}
				</Button>
			{/snippet}
		</Popover.Trigger>

		<Popover.Content align="start" class="w-auto p-0">
			<div class="flex flex-col gap-1 p-2">
				{#each presets as preset (preset.days)}
					<Button
						variant="ghost"
						size="sm"
						class="justify-start"
						onclick={() => applyPreset(preset.days)}
					>
						{preset.label}
					</Button>
				{/each}
			</div>

			<Separator />

			<RangeCalendar bind:value class="p-2" />

			<Separator />

			<div class="flex items-center justify-between gap-2 p-2">
				<Button variant="ghost" size="sm" onclick={() => apply('', '')}>Any date</Button>
				<Button
					size="sm"
					disabled={!value.start}
					onclick={() => apply(iso(value.start), iso(value.end ?? value.start))}
				>
					Apply
				</Button>
			</div>
		</Popover.Content>
	</Popover.Root>

	{#if active}
		<Button
			variant="ghost"
			size="icon"
			class="size-7 text-muted-foreground"
			onclick={() => apply('', '')}
			aria-label="Clear the date filter"
		>
			<X class="size-4" />
		</Button>
	{/if}
</div>
