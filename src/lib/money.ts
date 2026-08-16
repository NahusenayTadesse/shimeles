/**
 * Money handling.
 *
 * Every amount in the database is an integer in its currency's minor unit —
 * santim for ETB, cents for USD — because SQLite has no DECIMAL and a float
 * column loses cents. Nothing outside this file should divide or multiply by
 * 100; do it here so the factor lives in one place and zero-decimal
 * currencies stay correct if one is ever added.
 */

/** Minor units per major unit, per currency. */
const MINOR_UNITS: Record<string, number> = {
	ETB: 100,
	USD: 100,
	EUR: 100,
	GBP: 100
};

const factor = (currency: string) => MINOR_UNITS[currency.toUpperCase()] ?? 100;

/** `1500.50` birr → `150050` santim. Rounds, so a stray float cannot leak in. */
export const toMinor = (major: number, currency = 'ETB'): number =>
	Math.round(major * factor(currency));

/** `150050` santim → `1500.5` birr. For form defaults, not for display. */
export const toMajor = (minor: number, currency = 'ETB'): number => minor / factor(currency);

/** Display form: `ETB 1,500.50`. */
export const formatMoney = (minor: number | null | undefined, currency = 'ETB'): string => {
	const value = toMajor(minor ?? 0, currency);
	try {
		return new Intl.NumberFormat('en-ET', {
			style: 'currency',
			currency: currency.toUpperCase(),
			maximumFractionDigits: 2
		}).format(value);
	} catch {
		// An unknown currency code should degrade, not throw on a public page.
		return `${currency.toUpperCase()} ${value.toLocaleString()}`;
	}
};

/** Compact form for impact counters: `1.2M`, `450K`. */
export const formatCompact = (value: number): string =>
	new Intl.NumberFormat('en-US', {
		notation: 'compact',
		maximumFractionDigits: 1
	}).format(value);
