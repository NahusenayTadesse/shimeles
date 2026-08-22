import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	contactMessages,
	donations,
	formSubmissions,
	inKindDonations,
	volunteerApplications
} from '$lib/server/db/schema';

/**
 * Human-readable reference numbers — `SAF-MED-2026-0142`.
 *
 * These get read aloud over the phone by people with no case file in front of
 * them, so they are short, all-caps, and grouped. The sequence restarts each
 * calendar year within each prefix, which keeps the number short and makes the
 * year visible without a lookup.
 *
 * The counter is derived from `max(existing)` inside the same statement that
 * inserts, rather than kept in a separate table: better-sqlite3 runs
 * synchronously on a single connection, and the transaction wrapper below
 * closes the remaining gap, so two submissions arriving together cannot land
 * on the same number.
 */

const YEAR = () => new Date().getFullYear();

/** Strips anything that would make a reference ambiguous when spoken. */
const normalisePrefix = (prefix: string) =>
	prefix
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, 6) || 'GEN';

function nextSequence(pattern: string, column: string, table: string): number {
	// Everything after the prefix is the sequence, and the prefix is a known
	// length — so the substring starts at `pattern.length + 1` (SQLite's `substr`
	// is 1-indexed) rather than being taken from the right.
	//
	// `substr(column, -4)` would be the obvious way to write this and is wrong:
	// it reads the last four characters, so the moment a series passes
	// `SAF-XXX-YYYY-9999` and `padStart` yields five digits, `10000` is read back
	// as `0000` and the series silently restarts at 1 — against a UNIQUE column.
	//
	// Casting makes SQLite compare numerically rather than as text, so 0009 → 10
	// rather than 0009 → 001.
	const row = db.all<{ max: number | null }>(
		sql.raw(
			`select max(cast(substr(${column}, ${pattern.length + 1}) as integer)) as max
			 from ${table}
			 where ${column} like '${pattern}%'`
		)
	)[0] as { max: number | null } | undefined;

	return (row?.max ?? 0) + 1;
}

const format = (prefix: string, year: number, sequence: number) =>
	`SAF-${prefix}-${year}-${String(sequence).padStart(4, '0')}`;

/**
 * Next reference for an assistance application or contact message.
 * `prefix` comes from `form_definitions.reference_prefix`, so a new form added
 * from the dashboard gets its own series without a code change.
 */
export function nextSubmissionReference(prefix: string): string {
	const clean = normalisePrefix(prefix);
	const year = YEAR();
	const pattern = `SAF-${clean}-${year}-`;
	return format(clean, year, nextSequence(pattern, 'reference_number', 'form_submissions'));
}

/** Volunteer applications live in their own table and their own `VOL` series. */
export function nextVolunteerReference(): string {
	const year = YEAR();
	const pattern = `SAF-VOL-${year}-`;
	return format('VOL', year, nextSequence(pattern, 'reference_number', 'volunteer_applications'));
}

/**
 * Contact messages moved out of `form_submissions` into their own table, and
 * their `MSG` series moved with them. The series is continuous across that
 * move because the migration copied the old references over, so the next
 * number follows the last one a sender was actually given.
 */
export function nextContactReference(): string {
	const year = YEAR();
	const pattern = `SAF-MSG-${year}-`;
	return format('MSG', year, nextSequence(pattern, 'reference_number', 'contact_messages'));
}

/**
 * The code a bank-transfer donor writes on their transfer so finance can match
 * it. Uses `DON` and the same year-scoped series; it is the single string that
 * ties a statement line to a pledge.
 */
export function nextDonationReference(): string {
	const year = YEAR();
	const pattern = `SAF-DON-${year}-`;
	return format('DON', year, nextSequence(pattern, 'reference_code', 'donations'));
}

/**
 * The same series for a gift of goods. In-kind offers get their own `GIK`
 * prefix rather than sharing `DON`: the two are handled by different people
 * through different queues, and a coordinator ringing about a collection
 * should be able to tell from the reference alone that there is no bank
 * transfer to look for.
 */
export function nextInKindReference(): string {
	const year = YEAR();
	const pattern = `SAF-GIK-${year}-`;
	return format('GIK', year, nextSequence(pattern, 'reference_code', 'in_kind_donations'));
}

/**
 * Runs `work` in a transaction, so the reference it allocates and the row it
 * writes commit together. Without this, an insert failing after the sequence
 * was read would leave a gap — harmless — but two concurrent inserts could
 * read the same maximum, which is not.
 */
export const withReference = <T>(work: () => T): T => db.transaction(work as never) as T;

/** Kept alongside the generators so the shapes cannot drift apart. */
export const REFERENCE_PATTERN = /^SAF-[A-Z0-9]{1,6}-\d{4}-\d{4}$/;

/** Type-only re-exports so callers get autocompletion on the tables involved. */
export type ReferencedTable =
	| typeof formSubmissions
	| typeof volunteerApplications
	| typeof donations
	| typeof contactMessages
	| typeof inKindDonations;
