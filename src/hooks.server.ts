import { building } from '$app/environment';
import { sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import type { Handle } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import { startImpactSchedule } from '$lib/server/impact';

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
if (!building) startImpactSchedule();

export const handle = sequence(
	handleSecurity,
	handleCsrf,
	handleBlockPublicSignup,
	handleBetterAuth
);
