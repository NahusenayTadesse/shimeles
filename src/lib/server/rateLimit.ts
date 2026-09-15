/**
 * Per-address request throttling for the public routes.
 *
 * The public forms have a honeypot, which stops naive bots and nothing else.
 * Nothing at all stood in front of `/login`, `/forgot-password`, `/magic-link`
 * or `/reset-password` — unthrottled credential stuffing against accounts that
 * can read case files — and a public lookup keyed on a reference number is not
 * safe to offer without this.
 *
 * **Not built on `$lib/server/cache.ts`.** That module says in its own header
 * that anything with unbounded keys should stay out of it, and it never sweeps:
 * an address that appears once would hold a map entry until the process
 * restarted. This store keys on the client address, which is unbounded by
 * definition, so it sweeps on a timer and evicts under pressure.
 *
 * **The limits are code, not `site_settings`.** §7 keeps role permissions off
 * the dashboard because an access-control decision is not a content one, and
 * the same reading applies here: a staff member raising a limit is loosening a
 * control, not editing copy.
 *
 * Single process, single SQLite file (`deploy/shimeles.service` runs one
 * `ExecStart`), so an in-memory counter is the whole story. Behind two app
 * processes this becomes per-process and the effective limit doubles — at
 * which point the counters belong in the database, not in a second Map.
 */

/** A fixed window: `limit` requests per `windowMs`, counted per address. */
export interface Policy {
	id: string;
	limit: number;
	windowMs: number;
}

export interface Decision {
	allowed: boolean;
	/** Seconds until the window resets. For the `Retry-After` header. */
	retryAfter: number;
	/**
	 * True only on the request that first crossed the limit, so a flood writes
	 * one audit row per offender per window rather than one per request.
	 */
	firstBreach: boolean;
}

/**
 * Account recovery and sign-in.
 *
 * Twenty in fifteen minutes is deliberately loose. The Foundation's staff sit
 * behind one office connection, so every one of them shares an address here: a
 * limit tight enough to stop a determined attacker would lock out the whole
 * office on a Monday morning of mistyped passwords. This is a ceiling on
 * automated abuse, and Better Auth's own limiter on `/api/auth/*` — plus the
 * fixed one-sentence answer every recovery route already gives — is what makes
 * the endpoints safe to expose at all.
 */
export const AUTH_POLICY: Policy = { id: 'auth', limit: 20, windowMs: 15 * 60_000 };

/**
 * Public form submissions: applications, volunteering, contact, donations,
 * newsletter, and any form a staff member embeds in a page tomorrow.
 *
 * Twelve in ten minutes. A person completes one of these once; the headroom is
 * for somebody who submits, spots a typo in their phone number, and sends it
 * again, and for a family sharing one connection.
 */
export const PUBLIC_FORM_POLICY: Policy = { id: 'public-form', limit: 12, windowMs: 10 * 60_000 };

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** SvelteKit form actions, not Better Auth's HTTP endpoints — see `policyFor`. */
const AUTH_PATHS = new Set([
	'/login',
	'/forgot-password',
	'/magic-link',
	'/reset-password',
	'/setup'
]);

/**
 * Which policy governs a request, or `null` to leave it alone.
 *
 * Two families are deliberately exempt:
 *
 * - **`/dashboard`** — already behind a session and a permission check, and
 *   staff work in bursts a limiter would read as an attack: a caseworker
 *   ticking off a safeguarding checklist or a bulk status change posts far
 *   more often than any applicant.
 * - **`/api/auth`** — Better Auth's own `rateLimit` covers those routes, and
 *   it knows which of them are expensive. Two limiters over one path would
 *   make a 429 impossible to attribute.
 */
export function policyFor(pathname: string, method: string): Policy | null {
	if (!UNSAFE_METHODS.has(method)) return null;
	if (pathname.startsWith('/dashboard')) return null;
	if (pathname.startsWith('/api/auth')) return null;

	// Trailing slashes reach here as written; normalise so `/login/` is `/login`.
	const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
	if (AUTH_PATHS.has(path)) return AUTH_POLICY;

	return PUBLIC_FORM_POLICY;
}

interface Window {
	count: number;
	resetAt: number;
}

const windows = new Map<string, Window>();

/**
 * The point at which a flood is costing more memory than it is worth.
 *
 * Each entry is a short key and two numbers, so this is single-digit megabytes
 * — the cap exists so a distributed flood cannot grow the map without bound,
 * not because the normal working set is anywhere near it.
 */
const MAX_KEYS = 50_000;

/**
 * Counts one request against a policy and says whether it may proceed.
 *
 * A fixed window rather than a sliding one: it is one comparison and two
 * numbers per address, it cannot be gamed in any way that matters at these
 * limits, and the reset time it reports is a real instant, which is what
 * `Retry-After` needs to be honest.
 *
 * Blocked requests still count. Somebody hammering a limit holds themselves
 * out for the rest of the window rather than being handed a fresh allowance
 * the moment the old one lapses — but the window's end never moves, so the
 * lockout is bounded by `windowMs` however hard they push.
 */
export function consume(key: string, policy: Policy, now = Date.now()): Decision {
	const mapKey = `${policy.id}:${key}`;
	const existing = windows.get(mapKey);

	if (!existing || existing.resetAt <= now) {
		if (windows.size >= MAX_KEYS) evict(now);
		windows.set(mapKey, { count: 1, resetAt: now + policy.windowMs });
		return { allowed: true, retryAfter: 0, firstBreach: false };
	}

	existing.count += 1;

	const allowed = existing.count <= policy.limit;
	return {
		allowed,
		retryAfter: allowed ? 0 : Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
		firstBreach: existing.count === policy.limit + 1
	};
}

/** Drops windows that have already reset; then, if still full, the oldest tenth. */
function evict(now: number) {
	for (const [key, window] of windows) {
		if (window.resetAt <= now) windows.delete(key);
	}

	if (windows.size < MAX_KEYS) return;

	// Under a flood large enough that nothing has expired yet, forget the
	// windows closest to resetting: they are the ones whose owners are nearest
	// to being allowed through anyway.
	const oldest = [...windows.entries()]
		.sort((a, b) => a[1].resetAt - b[1].resetAt)
		.slice(0, Math.ceil(MAX_KEYS / 10));
	for (const [key] of oldest) windows.delete(key);
}

/**
 * Starts the sweep. Called once from `hooks.server.ts`, beside the impact
 * schedule, and unref'd for the same reason: a timer must not hold the process
 * open when systemd sends SIGTERM.
 */
export function startRateLimitSweep(intervalMs = 5 * 60_000) {
	const timer = setInterval(() => {
		try {
			evict(Date.now());
		} catch (err) {
			console.error('rate limit sweep failed', err);
		}
	}, intervalMs);
	timer.unref?.();
	return () => clearInterval(timer);
}

/** Test seam. Nothing in the app should need to forget every window at once. */
export function resetRateLimits() {
	windows.clear();
}
