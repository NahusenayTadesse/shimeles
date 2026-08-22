<script lang="ts">
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { cn } from '$lib/utils.js';
	import { CalendarDate, getLocalTimeZone, today, parseDate } from '@internationalized/date';
	import { CalendarIcon } from '@lucide/svelte';
	import { formatDate } from '$lib/dates';

	let {
		data = $bindable(),
		oldDays = false,
		year = false,
		futureDays = false
	}: {
		data: string | null | undefined;
		oldDays?: boolean;
		year?: boolean;
		futureDays?: boolean;
	} = $props();

	const todayDate = $derived(oldDays ? undefined : today(getLocalTimeZone()));

	/**
	 * Empty stays empty.
	 *
	 * This used to seed `form` with today whenever `data` was blank and then
	 * write it straight back through an effect — so simply *rendering* an
	 * optional date field answered it. A beneficiary with no date of birth on
	 * file got today's date (and date of birth is half the key
	 * `acceptApplication` matches returning families on), an unpublished blog
	 * post got today's publish date, and every optional date question on a
	 * public form auto-answered before anyone touched it.
	 *
	 * `undefined` renders as the placeholder, and `data` is only written when a
	 * date is actually chosen.
	 */
	let form = $state<CalendarDate | undefined>(data ? parseDate(data) : undefined);

	$effect(() => {
		const next = form ? form.toString() : '';
		if (next !== data) data = next;
	});

	/**
	 * The trigger label, in the app's one date format.
	 *
	 * This was the `en-US` outlier: a staff member picked a date here, saw
	 * `August 22, 2026`, and then saw `22/08/2026` in the table below it.
	 */
	const label = (date: CalendarDate | undefined): string =>
		date ? formatDate(date.toDate(getLocalTimeZone()), '') : '';
</script>

<Popover.Root>
	<Popover.Trigger
		class={cn(
			buttonVariants({
				variant: 'outline',
				class: 'justify-between '
			}),
			!form && 'text-muted-foreground'
		)}
	>
		<div class="flex items-center gap-2">
			<CalendarIcon />
			{label(form)}
		</div>
	</Popover.Trigger>

	<Popover.Content class="flex flex-wrap gap-2 border-t p-0 px-2 py-4!">
		{#if year}
			<!-- Typing is the fast path for a date decades in the past. The native
			     control takes `yyyy-mm-dd`, which is exactly what `data` holds, and
			     it renders in the viewer's own date convention — so nobody has to
			     work out whether the box wants day or month first. -->
			<label class="flex w-full flex-col gap-1 px-1 text-xs text-muted-foreground">
				Type it
				<input
					type="date"
					class="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
					value={form ? form.toString() : ''}
					max={futureDays ? today(getLocalTimeZone()).toString() : undefined}
					min={todayDate ? todayDate.toString() : undefined}
					oninput={(event) => {
						const next = event.currentTarget.value;
						// An in-progress year ("0002-01-01") is not a date anyone meant.
						form = /^\d{4}-\d{2}-\d{2}$/.test(next) ? parseDate(next) : form;
					}}
				/>
			</label>
		{/if}
		<Calendar
			type="single"
			captionLayout={year ? 'dropdown-years' : 'label'}
			minValue={todayDate}
			maxValue={futureDays ? today(getLocalTimeZone()) : undefined}
			bind:value={form}
		/>
		<!-- {#each [{ label: 'Today', value: 0 }, { label: 'Tomorrow', value: 1 }, { label: 'In 3 days', value: 3 }, { label: 'In a week', value: 7 }, { label: 'In 2 weeks', value: 14 }] as preset (preset.value)}
			<Button
				variant="outline"
				size="sm"
				class="flex-1"
				onclick={() => {
					form = today(getLocalTimeZone()).add({ days: preset.value });
				}}
			>
				{preset.label}
			</Button>
		{/each} -->
	</Popover.Content>
</Popover.Root>
