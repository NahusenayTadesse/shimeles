import { describe, expect, it } from 'vitest';
import { formatMoneyTotals, sumByCurrency, toMoneyTotals } from './money';

/**
 * The rule these guard: birr and dollars are counted apart, always.
 *
 * Every one of these cases is something a screen used to get wrong by calling
 * `sum(amount)` over a mixed table — santim added to cents, printed with one
 * currency's symbol in front of the answer.
 */
describe('sumByCurrency', () => {
	const rows = [
		{ amount: 150000, currency: 'ETB' },
		{ amount: 20000, currency: 'USD' },
		{ amount: 50000, currency: 'ETB' }
	];

	const totals = (input: typeof rows) =>
		sumByCurrency(
			input,
			(row) => row.amount,
			(row) => row.currency
		);

	it('keeps each currency to itself', () => {
		expect(totals(rows)).toEqual([
			{ currency: 'ETB', amount: 200000 },
			{ currency: 'USD', amount: 20000 }
		]);
	});

	it('orders by size, then by code, so the display does not flicker', () => {
		expect(
			totals([
				{ amount: 100, currency: 'USD' },
				{ amount: 100, currency: 'ETB' },
				{ amount: 900, currency: 'EUR' }
			])
		).toEqual([
			{ currency: 'EUR', amount: 900 },
			{ currency: 'ETB', amount: 100 },
			{ currency: 'USD', amount: 100 }
		]);
	});

	it('folds a missing or oddly-cased currency into the column default', () => {
		expect(
			totals([
				{ amount: 100, currency: 'etb' },
				{ amount: 100, currency: null as unknown as string },
				{ amount: 100, currency: '' }
			])
		).toEqual([{ currency: 'ETB', amount: 300 }]);
	});

	it('is empty for no rows, so a caller must say what zero is in', () => {
		expect(totals([])).toEqual([]);
	});
});

describe('toMoneyTotals', () => {
	it('accepts the strings SQLite returns from sum()', () => {
		expect(toMoneyTotals([{ currency: 'USD', amount: '2500' }])).toEqual([
			{ currency: 'USD', amount: 2500 }
		]);
	});
});

describe('formatMoneyTotals', () => {
	it('joins the currencies rather than adding them', () => {
		const text = formatMoneyTotals([
			{ currency: 'ETB', amount: 150050 },
			{ currency: 'USD', amount: 20000 }
		]);
		expect(text).toContain('1,500.50');
		expect(text).toContain('200.00');
		expect(text).toContain('+');
	});

	it('renders a zero in the currency the caller names', () => {
		expect(formatMoneyTotals([], 'USD')).toContain('0.00');
	});
});
