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

	if (event.url.pathname.startsWith('/dashboard') || event.url.pathname.startsWith('/files')) {
		response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	}

	return response;
};

// The impact counters are recomputed hourly (§4) rather than on every homepage
// visit. Started once per process, never during prerender.
if (!building) startImpactSchedule();

export const handle = sequence(handleSecurity, handleBlockPublicSignup, handleBetterAuth);
