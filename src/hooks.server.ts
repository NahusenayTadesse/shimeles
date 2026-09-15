import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle, RequestEvent } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { audit } from '$lib/server/audit';
import { clientAddress } from '$lib/server/clientAddress';
import { startImpactSchedule } from '$lib/server/impact';
import { consume, policyFor, startRateLimitSweep } from '$lib/server/rateLimit';

/**
 * Closes the public signup endpoint.
 *
 * Better Auth's email/password provider exposes `POST /api/auth/sign-up/email`
 * as soon as it is enabled. This is a staff-only system holding case data, so
 * anyone being able to mint themselves an account is not acceptable — but the
 * provider still has to be enabled, because `/setup` and the dashboard's user
 * management create accounts through `auth.api.signUpEmail` on the server,
 * which does not pass through this HTTP route.
 */
const handleBlockPublicSignup: Handle = async ({ event, resolve }) => {
	if (event.request.method === 'POST' && event.url.pathname.startsWith('/api/auth/sign-up')) {
		return new Response('Not found', { status: 404 });
	}
	return resolve(event);
};

/**
 * Cross-site form-submission check, replacing SvelteKit's built-in one.
 *
 * `csrf.checkOrigin` is turned off in `vite.config.ts` in favour of this, for
 * one reason: OpenLiteSpeed 1.9.0 — which fronts this app in production —
 * duplicates the `Origin` header when it proxies. A browser sends
 *
 *   Origin: https://example.org
 *
 * and the Node process receives
 *
 *   Origin: https://example.org, https://example.org
 *
 * because Node joins repeated headers with ", ". SvelteKit compares that
 * doubled string against `url.origin`, finds no match, and rejects every form
 * POST with 403. The bug is specific to `Origin` — Referer, Cookie and custom
 * headers all arrive intact — so there is no proxy setting to turn off.
 *
 * The security property is unchanged. A genuine cross-site POST still carries
 * one foreign origin and is still refused; what is tolerated is *repetition of
 * the expected origin and nothing else*. Any mix of distinct values fails on
 * the `size === 1` test.
 */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const FORM_CONTENT_TYPES = [
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain'
];

function isFormContentType(request: Request) {
	const type = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
	return !!type && FORM_CONTENT_TYPES.includes(type);
}

function originIsExpected(header: string | null, expected: string) {
	if (!header) return false;
	const seen = new Set(
		header
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean)
	);
	return seen.size === 1 && seen.has(expected);
}

const handleCsrf: Handle = async ({ event, resolve }) => {
	const { request, url } = event;

	if (
		UNSAFE_METHODS.has(request.method) &&
		isFormContentType(request) &&
		!originIsExpected(request.headers.get('origin'), url.origin)
	) {
		return new Response(`Cross-site ${request.method} form submissions are forbidden`, {
			status: 403
		});
	}

	return resolve(event);
};

/**
 * Throttles the public routes.
 *
 * Placed after `handleCsrf` so cross-site junk is already refused and does not
 * spend anybody's allowance, and before `handleBetterAuth` so a rejected
 * request costs no session lookup. Which paths are governed, and how heavily,
 * is `policyFor` in `$lib/server/rateLimit` — `/dashboard` and `/api/auth` are
 * exempt there, for reasons given in that file.
 *
 * `RATE_LIMIT_DISABLED=1` turns it off without a deploy. It exists because the
 * failure mode of a limiter that is keying on the wrong thing is the whole site
 * refusing everybody, and the person who has to fix that at night should not
 * need a build to do it.
 */
const handleRateLimit: Handle = async ({ event, resolve }) => {
	if (env.RATE_LIMIT_DISABLED === '1') return resolve(event);

	const policy = policyFor(event.url.pathname, event.request.method);
	if (!policy) return resolve(event);

	// No address means no bucket to count against, and inventing a shared one
	// would put every anonymous caller in a single window — one script could
	// then lock out the whole site. Let it through; `audit_log` still records
	// what happened.
	const address = clientAddress(event);
	if (!address) return resolve(event);

	const decision = consume(address, policy);
	if (decision.allowed) return resolve(event);

	if (decision.firstBreach) {
		audit({
			event,
			action: 'rate_limited',
			entityType: 'rate_limit',
			metadata: { policy: policy.id, path: event.url.pathname, method: event.request.method }
		});
	}

	return tooManyRequests(event, decision.retryAfter);
};

/**
 * A 429 the caller can actually read.
 *
 * A form posted through `enhance` has its response run through `deserialize`,
 * which is `JSON.parse` — hand that plain text and the applicant gets a parse
 * error instead of an explanation. So a request carrying SvelteKit's action
 * header gets an `ActionResult`, which surfaces through the app's own error
 * boundary; anything else (a form submitted with JavaScript off, curl) gets
 * the sentence itself.
 */
const TOO_MANY = 'Too many requests from this connection. Please wait a few minutes and try again.';

function tooManyRequests(event: RequestEvent, retryAfter: number) {
	const headers = {
		'Retry-After': String(retryAfter),
		'Cache-Control': 'no-store'
	};

	if (event.request.headers.get('x-sveltekit-action') === 'true') {
		return new Response(JSON.stringify({ type: 'error', error: { message: TOO_MANY } }), {
			status: 429,
			headers: { ...headers, 'Content-Type': 'application/json' }
		});
	}

	return new Response(TOO_MANY, {
		status: 429,
		headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }
	});
}

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

/**
 * Security headers.
 *
 * This system holds medical and mental-health-adjacent case data behind
 * `/dashboard`. `noindex` on those routes is not optional, and a referrer
 * policy that leaks a case URL to an external site would be a real disclosure.
 */
const handleSecurity: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'SAMEORIGIN');

	if (event.url.pathname.startsWith('/dashboard')) {
		response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	}

	/*
	 * `/files` used to be noindex'd here too, by path prefix. It cannot be.
	 *
	 * That one path serves both a beneficiary's medical letter and every
	 * photograph on the public site — including the `og:image` of every page,
	 * which is the image a link preview shows. A blanket `noindex` on it told
	 * Google not to index the Foundation's own photographs, and left the share
	 * images in a grey area with the crawlers that read the header.
	 *
	 * The distinction is per file, not per path, and only the file endpoint
	 * knows which is which — so it sets the header itself, from `is_public`.
	 */

	return response;
};

// The impact counters are recomputed hourly (§4) rather than on every homepage
// visit. Started once per process, never during prerender.
if (!building) {
	startImpactSchedule();
	startRateLimitSweep();
}

export const handle = sequence(
	handleSecurity,
	handleCsrf,
	handleRateLimit,
	handleBlockPublicSignup,
	handleBetterAuth
);
