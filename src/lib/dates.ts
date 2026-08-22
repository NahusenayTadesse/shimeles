/**
 * Date display.
 *
 * There were 31 date-formatting call sites and no shared helper, so they
 * disagreed: the dashboard lists used `en-GB` (`22/08/2026`), the date picker
 * used `en-US` (`August 22, 2026`), and the table export used whatever the
 * browser was set to. A staff member picked a date, saw it in American format,
 * then saw the same date in the table below in British format.
 *
 * Worse than inconsistent, it was ambiguous: `22/08/2026` and `08/22/2026` are
 * indistinguishable for the first twelve days of any month, and Ethiopian
 * offices read both conventions. On a disbursement date that is a real hazard.
 * So the default format writes the month in words — `22 Aug 2026` — which
 * cannot be read two ways.
 *
 * The calendar stays Gregorian. The Ethiopian calendar is a much larger
 * decision than a formatter, and is not v1.
 *
 * Every function accepts what the app actually holds: a `Date` from a
 * timestamp column, an ISO `yyyy-mm-dd` string from a date column, epoch
 * milliseconds, or null for "nothing on file".
 */

/** `en-GB` gives `22 Aug 2026` from these options; the locale is not the point, the explicit parts are. */
const LOCALE = 'en-GB';

export type DateInput = Date | string | number | null | undefined;

/**
 * A plain `yyyy-mm-dd` is a calendar date, not an instant.
 *
 * `new Date('2026-08-22')` parses as midnight UTC, so in any timezone behind
 * UTC it formats as the 21st. Dates of birth and disbursement dates are stored
 * that way, and being a day out on either is the kind of error nobody notices
 * until it matters. Parsed as local noon, no timezone can shift the day.
 */
function toDate(value: DateInput): Date | null {
	if (value === null || value === undefined || value === '') return null;
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
	if (typeof value === 'number') return new Date(value);

	const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(value);
	if (dateOnly) {
		const [year, month, day] = value.split('-').map(Number);
		return new Date(year, month - 1, day, 12);
	}

	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const format = (value: DateInput, options: Intl.DateTimeFormatOptions, fallback: string) => {
	const date = toDate(value);
	return date ? new Intl.DateTimeFormat(LOCALE, options).format(date) : fallback;
};

/** `22 Aug 2026`. The default everywhere a date is shown. */
export const formatDate = (value: DateInput, fallback = '—'): string =>
	format(value, { day: 'numeric', month: 'short', year: 'numeric' }, fallback);

/** `22 Aug 2026, 14:05`. For audit rows and anything where the hour matters. */
export const formatDateTime = (value: DateInput, fallback = '—'): string =>
	format(
		value,
		{ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
		fallback
	);

/** `Monday, 22 August`. For a handover someone has to turn up to — the weekday is the useful part. */
export const formatDayLong = (value: DateInput, fallback = '—'): string =>
	format(value, { weekday: 'long', day: 'numeric', month: 'long' }, fallback);

/** `22 August 2026`. For a public page, where there is room for the whole word. */
export const formatDateLong = (value: DateInput, fallback = '—'): string =>
	format(value, { day: 'numeric', month: 'long', year: 'numeric' }, fallback);

/** `22 Aug`. For a dense table cell where the year is obvious from context. */
export const formatDateShort = (value: DateInput, fallback = '—'): string =>
	format(value, { day: 'numeric', month: 'short' }, fallback);

/** `Aug 2026`. For the chart axes on the impact screen. */
export const formatMonth = (value: DateInput, fallback = '—'): string =>
	format(value, { month: 'short', year: 'numeric' }, fallback);

/** `2026-08-22` — for filenames and anything a machine reads back. */
export const formatDateIso = (value: DateInput, fallback = ''): string => {
	const date = toDate(value);
	if (!date) return fallback;
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * "3 days ago", for staleness rather than for the record itself.
 *
 * Deliberately coarse: a relative time is friendlier at a glance but useless
 * for a case note, so this is for badges and hints, never for a date a staff
 * member has to act on.
 */
export function formatRelative(value: DateInput, now = Date.now()): string {
	const date = toDate(value);
	if (!date) return '—';

	const seconds = Math.round((now - date.getTime()) / 1000);
	const future = seconds < 0;
	const abs = Math.abs(seconds);

	const units: [Intl.RelativeTimeFormatUnit, number][] = [
		['year', 31_536_000],
		['month', 2_592_000],
		['week', 604_800],
		['day', 86_400],
		['hour', 3600],
		['minute', 60]
	];

	const formatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
	for (const [unit, size] of units) {
		if (abs >= size) {
			const amount = Math.floor(abs / size);
			return formatter.format(future ? amount : -amount, unit);
		}
	}
	return 'just now';
}
