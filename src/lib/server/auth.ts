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
	/**
	 * Twelve hours, refreshed each day it is used.
	 *
	 * Better Auth's default is seven days, which is a long time for a session
	 * on a system holding medical and mental-health case notes — often on a
	 * shared office machine that nobody signs out of. Twelve hours means a
	 * session does not outlive the working day it was created in, while
	 * `updateAge` keeps someone who is actually using the dashboard from being
	 * thrown out mid-task.
	 */
	session: {
		expiresIn: 60 * 60 * 12,
		updateAge: 60 * 60 * 24
	},
	plugins: [
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
