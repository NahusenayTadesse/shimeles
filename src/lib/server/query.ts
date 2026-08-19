import { and, asc, count, desc, eq, gte, lt, or, sql, type SQL } from 'drizzle-orm';
import type { AnyColumn } from 'drizzle-orm';
import type { SQLiteSelectQueryBuilder } from 'drizzle-orm/sqlite-core';

/**
 * Server-side list filtering: the pieces a screen too big to send to the
 * browser needs, and nothing more.
 *
 * The list screens came in two shapes — content tables that loaded every row
 * and filtered in the browser, and case tables that hand-rolled the same
 * `searchParams` → `clauses` → `where` sequence four times over. The first
 * stops working once a table grows; the second is where a forgotten
 * `deletedAt` check turns into a bug.
 *
 * What is shared is small and deliberately so: escape a search term, compare a
 * date range, clamp a page, whitelist a sort column. Each screen still says in
 * plain Drizzle which columns its filters touch, because that reads better
 * than a configuration object that has to be decoded before anyone can tell
 * what a screen actually filters on.
 */

/* ==========================================================================
   Search

   SQLite's LIKE treats `%` and `_` as wildcards, so a search for "50%" would
   otherwise match everything from "50" onwards, and a search for "_" would
   match every row in the table. They are escaped here and the pattern gets an
   explicit ESCAPE character — which `like()` has no parameter for, hence the
   template.
   ========================================================================== */

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * One search box across several columns: matches when any of them contains the
 * term. Returns undefined for an empty term, which `and()` ignores — an empty
 * box narrows nothing rather than matching nothing.
 */
export function searchFilter(term: string, columns: AnyColumn[]): SQL | undefined {
	const trimmed = term.trim();
	if (!trimmed || !columns.length) return undefined;

	const needle = `%${escapeLike(trimmed)}%`;
	const clauses = columns.map((column) => sql`${column} like ${needle} escape '\\'`);
	return clauses.length === 1 ? clauses[0] : or(...clauses);
}

/** An equality filter from a URL parameter. Blank means "no filter". */
export function equalsFilter(column: AnyColumn, value: string | null | undefined): SQL | undefined {
	if (value === null || value === undefined || value === '') return undefined;
	return eq(column, value);
}

/** The same for a numeric foreign key, which arrives from the URL as a string. */
export function idFilter(column: AnyColumn, value: string | null | undefined): SQL | undefined {
	if (!value) return undefined;
	const id = Number(value);
	return Number.isFinite(id) ? eq(column, id) : undefined;
}

/** A boolean column. `flagField`'s trap again: `Boolean("false")` is true. */
export function flagFilter(column: AnyColumn, value: string | null | undefined): SQL | undefined {
	if (!value) return undefined;
	const normalised = value.trim().toLowerCase();
	if (!['true', 'false', '1', '0', 'yes', 'no'].includes(normalised)) return undefined;
	return eq(column, ['true', '1', 'yes'].includes(normalised));
}

/* ==========================================================================
   Date ranges
   ========================================================================== */

export interface DateRange {
	/** `YYYY-MM-DD`, as the date inputs and the calendar both produce. */
	from: string;
	to: string;
}

export const parseDateRange = (
	params: URLSearchParams,
	fromKey = 'from',
	toKey = 'to'
): DateRange => ({
	from: isoDay(params.get(fromKey)),
	to: isoDay(params.get(toKey))
});

/** Keeps only a well-formed `YYYY-MM-DD`; anything else is "not set". */
const isoDay = (value: string | null): string =>
	value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';

/**
 * An inclusive date range over an epoch-milliseconds column.
 *
 * A date is a day, not an instant. The upper bound is therefore the start of
 * the day *after* `to` with a strict `<`, so "to 4 March" includes everything
 * that happened on 4 March rather than only the row stamped exactly midnight.
 *
 * Either end may be omitted, which is what makes "everything since March" and
 * "everything before March" the same control.
 */
export function dateRangeFilter(column: AnyColumn, range: DateRange): SQL | undefined {
	const clauses: SQL[] = [];

	if (range.from) {
		const start = new Date(`${range.from}T00:00:00`);
		if (!Number.isNaN(start.getTime())) clauses.push(gte(column, start));
	}

	if (range.to) {
		const end = new Date(`${range.to}T00:00:00`);
		if (!Number.isNaN(end.getTime()))
			clauses.push(lt(column, new Date(end.getTime() + 86_400_000)));
	}

	if (!clauses.length) return undefined;
	return clauses.length === 1 ? clauses[0] : and(...clauses);
}

/* ==========================================================================
   Sorting & pagination
   ========================================================================== */

/**
 * The columns a screen allows sorting by.
 *
 * A whitelist rather than a lookup on the table: `?sort=` reaches an ORDER BY,
 * and a screen should decide what it is orderable by rather than inheriting
 * every column it happens to have.
 */
export type SortMap = Record<string, AnyColumn>;

export interface SortState {
	field: string | null;
	direction: 'asc' | 'desc';
}

export function parseSort(params: URLSearchParams, map: SortMap, fallback?: SortState): SortState {
	const field = params.get('sort');
	const direction = params.get('dir') === 'asc' ? 'asc' : 'desc';
	if (field && map[field]) return { field, direction };
	return fallback ?? { field: null, direction: 'desc' };
}

export const orderFor = (sort: SortState, map: SortMap): SQL[] => {
	const column = sort.field ? map[sort.field] : undefined;
	if (!column) return [];
	return [sort.direction === 'asc' ? asc(column) : desc(column)];
};

export interface PageState {
	page: number;
	perPage: number;
}

/**
 * Reads `?page=` and `?perPage=`.
 *
 * `perPage` is clamped rather than trusted: it reaches a `LIMIT`, and
 * `?perPage=1000000` on a table that has grown is a cheap way to make the
 * server do a lot of work.
 */
export function parsePage(
	params: URLSearchParams,
	defaultPerPage = 25,
	maxPerPage = 200
): PageState {
	const requestedPage = Number(params.get('page') ?? '1');
	const requestedPerPage = Number(params.get('perPage') ?? String(defaultPerPage));

	return {
		page: Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1,
		perPage: Number.isFinite(requestedPerPage)
			? Math.min(maxPerPage, Math.max(5, Math.floor(requestedPerPage)))
			: defaultPerPage
	};
}

/* ==========================================================================
   Running one
   ========================================================================== */

export interface ListResult<Row> {
	rows: Row[];
	total: number;
	page: number;
	perPage: number;
	pageCount: number;
	sort: SortState;
}

export interface ListOptions<Row> {
	url: URL;
	/** Every clause the screen wants ANDed. Undefined entries are dropped. */
	where: (SQL | undefined)[];
	sortMap: SortMap;
	rows: (args: {
		where: SQL | undefined;
		orderBy: SQL[];
		limit: number;
		offset: number;
	}) => Promise<Row[]>;
	count: (where: SQL | undefined) => Promise<number>;
	defaultSort?: SortState;
	defaultPerPage?: number;
	maxPerPage?: number;
}

/**
 * Count, clamp, fetch.
 *
 * The count uses the same WHERE as the rows — a total that disagrees with the
 * page under it is how pagination starts skipping records. A page past the end
 * is clamped and fetched rather than returned empty, because the usual way to
 * land on one is to be on page 9 and then add a filter, and an empty screen
 * reads as "no results" when the truth is "no results *here*".
 */
export async function listPage<Row>(options: ListOptions<Row>): Promise<ListResult<Row>> {
	const { url, where: clauses, sortMap, rows, count: countRows } = options;

	const sort = parseSort(url.searchParams, sortMap, options.defaultSort);
	const paging = parsePage(url.searchParams, options.defaultPerPage, options.maxPerPage);

	const usable = clauses.filter(Boolean) as SQL[];
	const where = usable.length ? and(...usable) : undefined;

	const total = await countRows(where);
	const pageCount = Math.max(1, Math.ceil(total / paging.perPage));
	const page = Math.min(paging.page, pageCount);

	return {
		rows: await rows({
			where,
			orderBy: orderFor(sort, sortMap),
			limit: paging.perPage,
			offset: (page - 1) * paging.perPage
		}),
		total,
		page,
		perPage: paging.perPage,
		pageCount,
		sort
	};
}

/** `select({ value: count() })` returns a one-row array; this is the unwrap. */
export const countOf = async (query: Promise<{ value: number }[]>): Promise<number> =>
	(await query)[0]?.value ?? 0;

/** Applies an ORDER BY only when there is one, keeping call sites unbranched. */
export const withOrder = <Q extends SQLiteSelectQueryBuilder>(query: Q, orderBy: SQL[]): Q =>
	orderBy.length ? (query.orderBy(...orderBy) as Q) : query;

export { count };
