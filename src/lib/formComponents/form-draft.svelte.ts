import { browser } from '$app/environment';

/**
 * Keeping a half-finished form alive.
 *
 * `/apply` and `/volunteer` take twenty minutes to fill in. Until now a back
 * button, a mistyped URL or a phone deciding to reload the tab lost all of it
 * with no warning and nothing to recover. The unsaved-changes guard catches
 * some of that; it does not survive the tab actually going away.
 *
 * Two rules shape everything here, and both come from what these forms hold:
 *
 * 1. **Never restore silently.** The saved answers are offered behind a banner
 *    the person has to accept. A returning user on a shared phone finding a
 *    form pre-filled with someone else's household and medical detail is worse
 *    than the loss this is meant to prevent.
 * 2. **Expire quickly, and be deletable.** A draft older than the TTL is
 *    dropped on sight, and "Start again" wipes it immediately. `/apply` in
 *    particular holds the kind of detail that should not sit in a browser for
 *    a week because someone once started an application on a library computer.
 *
 * Files are never part of a draft — a `File` cannot be serialised, and
 * silently dropping an attachment someone believed was saved would be its own
 * small betrayal.
 */

const PREFIX = 'saf:draft:';

/** Two days. Long enough to finish tomorrow, short enough not to linger. */
const TTL_MS = 2 * 24 * 60 * 60 * 1000;

interface Stored {
	savedAt: number;
	data: Record<string, unknown>;
}

function read(key: string): Stored | null {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(PREFIX + key);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Stored;
		if (!parsed?.savedAt || Date.now() - parsed.savedAt > TTL_MS) {
			localStorage.removeItem(PREFIX + key);
			return null;
		}
		return parsed;
	} catch {
		// A quota error, private-mode restriction or corrupt entry must never
		// take the form down with it.
		return null;
	}
}

/**
 * A draft for one form, as a rune-powered object a component can hold.
 *
 * Usage is deliberately explicit — `watch()` to start saving, `restore()` and
 * `discard()` wired to the two buttons on the banner — rather than a magic
 * two-way binding, because "when does this write to disk" is the whole
 * question with a form like this.
 */
export function formDraft(key: string) {
	const existing = read(key);

	let savedAt = $state<number | null>(existing?.savedAt ?? null);
	/** Held aside rather than applied: nothing is restored until asked. */
	const pending = existing?.data ?? null;
	let dismissed = $state(false);

	let timer: ReturnType<typeof setTimeout> | undefined;

	function write(data: Record<string, unknown>) {
		if (!browser) return;
		try {
			localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data }));
		} catch {
			/* Full or blocked storage is not worth an error on a form. */
		}
	}

	return {
		/** True when there is something worth offering to restore. */
		get available() {
			return Boolean(pending) && !dismissed;
		},
		get savedAt() {
			return savedAt;
		},

		/**
		 * Saves on a debounce.
		 *
		 * Call it from an `$effect` that reads the form store: the effect
		 * re-runs on every keystroke, and this collapses those into one write a
		 * second or so.
		 */
		save(data: Record<string, unknown>) {
			clearTimeout(timer);
			timer = setTimeout(() => write(strip(data)), 800);
		},

		/** Hands back the saved answers and takes the banner away. */
		restore(): Record<string, unknown> | null {
			dismissed = true;
			return pending;
		},

		/** "Start again", and what a successful submit calls. */
		discard() {
			dismissed = true;
			savedAt = null;
			clearTimeout(timer);
			if (browser) {
				try {
					localStorage.removeItem(PREFIX + key);
				} catch {
					/* nothing to do */
				}
			}
		}
	};
}

/**
 * Drops the values that must not be persisted.
 *
 * `File` and `FileList` cannot survive `JSON.stringify` in any useful form,
 * and the honeypot is not the applicant's data.
 */
function strip(data: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [field, value] of Object.entries(data)) {
		if (field === 'website' || field === 'documents' || field === 'photos') continue;
		if (value instanceof File || (typeof FileList !== 'undefined' && value instanceof FileList)) {
			continue;
		}
		out[field] = value;
	}
	return out;
}
