<script lang="ts">
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { Calendar } from '$lib/components/ui/calendar';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { cn } from '$lib/utils.js';
	import { CalendarDate, getLocalTimeZone, today, parseDate } from '@internationalized/date';
	import { CalendarIcon } from '@lucide/svelte';

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

	const formatDate = (date: CalendarDate | undefined): string => {
		if (!date) return '';

		const formatter = new Intl.DateTimeFormat('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});

		return formatter.format(date.toDate(getLocalTimeZone()));
	};
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
			{formatDate(form)}
		</div>
	</Popover.Trigger>

	<Popover.Content class="flex flex-wrap gap-2 border-t p-0 px-2 py-4!">
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
