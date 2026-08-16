import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

/**
 * SQLite tuning.
 *
 * better-sqlite3 is synchronous, so every query blocks the Node event loop for
 * its duration. That is fine — and usually faster than a network database —
 * provided each query is short. The pragmas below are what keep them short and
 * what let many readers run while a writer is mid-transaction:
 *
 * - `journal_mode = WAL` is the load-bearing one. In the default rollback
 *   journal, a single writer blocks every reader. Under WAL, readers never
 *   block and never are blocked; they read a consistent snapshot while the
 *   writer appends. For this system that is the difference between a donation
 *   write stalling the homepage and it not.
 * - `synchronous = NORMAL` is the correct companion to WAL: fsync happens at
 *   checkpoints rather than on every commit. The documented risk is losing the
 *   last few transactions on an OS-level crash (not on an app crash), which is
 *   an acceptable trade here and is the standard WAL pairing.
 * - `busy_timeout` makes a contended write wait and retry rather than throw
 *   SQLITE_BUSY immediately. Without it, concurrent writes surface as errors.
 * - `cache_size` is negative on purpose: SQLite reads that as kibibytes, so
 *   -64000 is a 64 MB page cache rather than 64000 pages.
 * - `mmap_size` lets reads come from the page cache without a syscall.
 * - `foreign_keys` is OFF by default in SQLite, per-connection. Every FK in
 *   the schema below is inert unless this is set.
 */
const PRAGMAS = [
	'journal_mode = WAL',
	'synchronous = NORMAL',
	'busy_timeout = 5000',
	'foreign_keys = ON',
	'cache_size = -64000',
	'temp_store = MEMORY',
	'mmap_size = 268435456',
	// Checkpoint roughly every 4 MB of WAL rather than letting it grow unbounded.
	'wal_autocheckpoint = 1000',
	// Let SQLite reclaim space from soft-deleted rows without a manual VACUUM.
	'auto_vacuum = INCREMENTAL'
];

const client = new Database(env.DATABASE_URL);

for (const pragma of PRAGMAS) client.pragma(pragma);

/**
 * `optimize` asks SQLite to refresh its query-planner statistics. Running it
 * once at startup and then hourly keeps the planner honest as tables grow —
 * without it, a query planned when `form_submissions` held 10 rows can still
 * be planned that way at 100,000.
 */
client.pragma('optimize');
const optimizeTimer = setInterval(
	() => {
		try {
			client.pragma('optimize');
			client.pragma('incremental_vacuum');
		} catch (err) {
			console.error('SQLite maintenance failed:', err);
		}
	},
	60 * 60 * 1000
);
optimizeTimer.unref?.();

/** Flush the WAL back into the main database file and close cleanly. */
function shutdown() {
	try {
		client.pragma('wal_checkpoint(TRUNCATE)');
		client.close();
	} catch {
		/* already closed */
	}
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.once('exit', shutdown);

export const sqlite = client;
export const db = drizzle(client, { schema });
