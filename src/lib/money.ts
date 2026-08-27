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

/* ==========================================================================
   Totals across more than one currency
   ========================================================================== */

/**
 * A total, and the currency it is a total *of*.
 *
 * Every screen that adds money up produces a list of these rather than a
 * number, because the Foundation takes birr locally and dollars from the
 * diaspora and `sum(amount)` over both is not a quantity of anything: 500 USD
 * plus 500 ETB is neither 1,000 of one nor 1,000 of the other, and whichever
 * currency symbol got printed in front of the answer made it a lie. Amounts
 * are stored in minor units per currency (see the head of this file), so the
 * integers cannot even be meaningfully compared, let alone added.
 *
 * There is no conversion here on purpose. A rate is a fact about a date that
 * the Foundation does not record, and inventing one inside a display helper
 * would bury an exchange-rate assumption in a `<span>`.
 */
export interface MoneyTotal {
	currency: string;
	/** Minor units of `currency`. */
	amount: number;
}

/** Uppercased, with the ETB default that the schema columns also carry. */
const normaliseCurrency = (currency: string | null | undefined): string =>
	(currency ?? 'ETB').toUpperCase() || 'ETB';

/**
 * Adds rows up per currency.
 *
 * Rows carrying a null or blank currency fall into `ETB`, matching the
 * `default('ETB')` on every money column, so a legacy row cannot open a
 * phantom "" bucket next to the real one.
 *
 * The result is sorted largest first, then by code, so a screen's dominant
 * currency leads and the order does not flicker between loads.
 */
export const sumByCurrency = <T>(
	rows: readonly T[],
	amountOf: (row: T) => number | null | undefined,
	currencyOf: (row: T) => string | null | undefined
): MoneyTotal[] => {
	const totals = new Map<string, number>();
	for (const row of rows) {
		const amount = Number(amountOf(row) ?? 0);
		if (!Number.isFinite(amount)) continue;
		const currency = normaliseCurrency(currencyOf(row));
		totals.set(currency, (totals.get(currency) ?? 0) + amount);
	}
	return [...totals]
		.map(([currency, amount]) => ({ currency, amount }))
		.sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));
};

/**
 * Normalises rows a grouped SQL query already produced.
 *
 * `sum()` comes back from SQLite as a string often enough that `Number()` here
 * is not defensive padding, and grouping in SQL still needs the same currency
 * fallback and ordering as grouping in JS.
 */
export const toMoneyTotals = (
	rows: readonly { currency?: string | null; amount?: number | string | null }[]
): MoneyTotal[] =>
	sumByCurrency(
		rows,
		(row) => Number(row.amount ?? 0),
		(row) => row.currency
	);

/**
 * Display form for a multi-currency total: `ETB 1,500.00 + USD 200.00`.
 *
 * `empty` is what an empty list renders as — a screen that has taken no money
 * yet should say `ETB 0.00`, not nothing at all, so the caller names the
 * currency that zero is in.
 */
export const formatMoneyTotals = (totals: readonly MoneyTotal[], empty = 'ETB'): string =>
	totals.length
		? totals.map((total) => formatMoney(total.amount, total.currency)).join(' + ')
		: formatMoney(0, empty);
