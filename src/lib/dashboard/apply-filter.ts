import { goto } from '$app/navigation';

/**
 * Write one filter into the URL.
 *
 * Every list filter in the dashboard works this way — the URL is the state, so
 * a filtered list is a link a staff member can bookmark or send on, the back
 * button behaves, and the server does the narrowing in SQL.
 *
 * Shared because `FilterBar` is not always the only control on a screen: the
 * audit log's action buttons, the blog's category chips and its date range all
 * sit outside the bar and need exactly the same URL rules. This used to be
 * copied into each of them, with a comment explaining that it mirrored the
 * original — which is the kind of duplication that survives until the two
 * copies disagree.
 */
export function applyFilter(
	url: URL,
	key: string,
	value: string | null,
	options: { resetsPage?: boolean } = {}
) {
	const next = new URL(url);

	if (value === null || value === '') next.searchParams.delete(key);
	else next.searchParams.set(key, value);

	// A changed filter renumbers the results, so page 4 of the old set is
	// meaningless — returning to the first is the only honest answer.
	if (options.resetsPage !== false) next.searchParams.delete('page');

	return goto(`${next.pathname}${next.search}`, { keepFocus: true, noScroll: true });
}

/** Several at once, for controls that own more than one parameter (a range). */
export function applyFilters(
	url: URL,
	values: Record<string, string | null>,
	options: { resetsPage?: boolean } = {}
) {
	const next = new URL(url);

	for (const [key, value] of Object.entries(values)) {
		if (value === null || value === '') next.searchParams.delete(key);
		else next.searchParams.set(key, value);
	}

	if (options.resetsPage !== false) next.searchParams.delete('page');

	return goto(`${next.pathname}${next.search}`, { keepFocus: true, noScroll: true });
}
