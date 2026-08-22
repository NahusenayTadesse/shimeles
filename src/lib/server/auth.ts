import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: { enabled: true },
	/*
	 * Session length is Better Auth's default — seven days — on purpose.
	 *
	 * Shortening it is a decision for the Foundation, not for us: staff sign in
	 * on office machines all day, and being logged out mid-afternoon is a real
	 * cost against a real benefit. Kept here, commented, so it is one
	 * uncomment away if the client asks for a tighter window:
	 *
	 * session: {
	 * 	expiresIn: 60 * 60 * 12,   // twelve hours
	 * 	updateAge: 60 * 60 * 24    // refreshed on a day's use
	 * },
	 */
	plugins: [
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
