/**
 * A tiny in-process TTL cache.
 *
 * Site settings, translations, navigation and pillars are read on essentially
 * every public request and written a handful of times a month. Hitting SQLite
 * for them is cheap, but hitting it four times per request across every
 * concurrent visitor is not free either — and because better-sqlite3 is
 * synchronous, every avoided query is event-loop time handed back.
 *
 * Deliberately not an LRU with eviction: the number of distinct keys here is
 * fixed and small (one per cached collection). Anything with unbounded keys
 * should query the database directly rather than grow this map.
 */
type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();

/** How long a cached collection may be stale. Content edits call `invalidate`. */
const DEFAULT_TTL = 60_000;

/**
 * Returns the cached value, or computes and caches it.
 *
 * The in-flight promise is stored, not just the resolved value, so a cold
 * cache under concurrent load runs the loader once rather than once per
 * waiting request.
 */
export async function cached<T>(
	key: string,
	loader: () => Promise<T>,
	ttl = DEFAULT_TTL
): Promise<T> {
	const hit = store.get(key) as Entry<Promise<T> | T> | undefined;
	if (hit && hit.expires > Date.now()) return hit.value as T;

	const promise = loader().catch((err) => {
		// A failed load must not be cached as a permanent empty result.
		store.delete(key);
		throw err;
	});

	store.set(key, { value: promise, expires: Date.now() + ttl });
	return promise;
}

/**
 * Reads a key without populating it, returning `undefined` on a miss.
 *
 * For the caller that can only decide whether a value is cacheable *after* it
 * has loaded it — `/files/[name]`, where a public asset is worth caching and a
 * private case document must not be. `cached()` cannot express that, since it
 * commits to storing whatever the loader returns.
 */
export async function peek<T>(key: string): Promise<T | undefined> {
	const hit = store.get(key) as Entry<Promise<T> | T> | undefined;
	if (!hit || hit.expires <= Date.now()) return undefined;
	return (await hit.value) as T;
}

/** Drop one key, or every key sharing a prefix. Call after any content write. */
export function invalidate(prefix?: string) {
	if (!prefix) return store.clear();
	for (const key of store.keys()) {
		if (key === prefix || key.startsWith(`${prefix}:`)) store.delete(key);
	}
}
