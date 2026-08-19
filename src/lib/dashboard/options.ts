import type { Item } from '$lib/global.svelte';

/**
 * Option lists shared across the generic CRUD screens.
 *
 * Boolean columns are edited through a Select rather than a checkbox: a
 * checkbox that posts nothing when unticked is the classic way an "unpublish"
 * silently fails, and an explicit Yes/No is also clearer in a table row.
 * `flagField` in `$lib/server/crud` parses the string these post.
 */
export const yesNo: Item[] = [
	{ value: 'true', name: 'Yes' },
	{ value: 'false', name: 'No' }
];

/** Turns any `{ id, name }`-ish rows into the `{ value, name }` selects want. */
export const toItems = <T extends Record<string, unknown>>(
	rows: T[],
	nameKey: keyof T = 'name' as keyof T,
	valueKey: keyof T = 'id' as keyof T
): Item[] =>
	rows.map((row) => ({ value: String(row[valueKey]), name: String(row[nameKey] ?? '') }));

/**
 * The theme accent tokens content rows may carry (`pillars.color`,
 * `blog_categories.color`). Deliberately a closed list: these map to CSS
 * custom properties in `layout.css`, so a free-text colour would render as
 * nothing at all.
 */
export const accentItems: Item[] = [
	{ value: 'olive', name: 'Olive' },
	{ value: 'clay', name: 'Clay' },
	{ value: 'plum', name: 'Plum' },
	{ value: 'sky', name: 'Sky' }
];
