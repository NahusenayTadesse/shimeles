import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins/magic-link';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { magicLinkTemplate, passwordResetTemplate, sendEmail } from '$lib/server/email';

/**
 * How long a reset link and a sign-in link stay usable.
 *
 * An hour for a password reset, matching Better Auth's own default: long
 * enough for somebody to find the email on a phone and get to a machine.
 *
 * Fifteen minutes for a magic link, which is *longer* than the plugin's
 * five-minute default and deliberately so — five minutes is a fair setting for
 * a consumer app on the same device, and a poor one for a caseworker whose
 * mail arrives on a phone in a building with patchy signal. It is still short
 * enough that a link sitting in an inbox stops being a key within the hour.
 */
const RESET_EXPIRES_IN = 60 * 60;
const MAGIC_LINK_EXPIRES_IN = 60 * 15;

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: {
		enabled: true,
		/**
		 * The reset email. Sent by Better Auth, worded and branded by us.
		 *
		 * `url` is built from `baseURL`, which is `ORIGIN` — and unlike the
		 * decorative links in other emails (which come from the `site.url`
		 * setting, see `email-templates.ts`) this one *must* be the origin that
		 * actually serves the app, because the token is verified by the running
		 * server at the end of it. A mismatch here is a link that 404s, not a
		 * link that looks wrong.
		 */
		sendResetPassword: async ({ user, url }) => {
			await sendEmail({
				to: user.email,
				...passwordResetTemplate({
					name: user.name,
					url,
					expiresIn: RESET_EXPIRES_IN
				})
			});
		},
		resetPasswordTokenExpiresIn: RESET_EXPIRES_IN,
		/**
		 * A reset ends every other session.
		 *
		 * Somebody resetting a password they believe is known has fixed nothing
		 * while the session on the machine that knew it is still open. The same
		 * reasoning — and the same default — as the "sign out other devices" box
		 * on `/dashboard/password`, except that here it is not optional: a person
		 * who has *forgotten* their password cannot be asked to judge whether
		 * their other sessions are safe.
		 */
		revokeSessionsOnPasswordReset: true
	},
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
		magicLink({
			/**
			 * **The load-bearing option.** Without it, `POST
			 * /api/auth/sign-in/magic-link` creates an account for any address it
			 * is given and emails a working session link to it — a public signup
			 * endpoint by another name, on a system holding case data. That is the
			 * exact hole `handleBlockPublicSignup` in `hooks.server.ts` exists to
			 * close for the email/password route, and the plugin's default is
			 * `false`, so leaving it out would have quietly reopened it.
			 *
			 * A magic link here can only ever reach an address that already has a
			 * staff account.
			 */
			disableSignUp: true,
			expiresIn: MAGIC_LINK_EXPIRES_IN,
			/**
			 * Five requests a minute, the plugin's default, restated so it is
			 * visible: this endpoint sends mail to an address chosen by an
			 * unauthenticated caller, and an unthrottled one is a way to use the
			 * Foundation's mail account against somebody.
			 */
			rateLimit: { window: 60, max: 5 },
			sendMagicLink: async ({ email, url }) => {
				await sendEmail({
					to: email,
					...magicLinkTemplate({ name: null, url, expiresIn: MAGIC_LINK_EXPIRES_IN })
				});
			}
		}),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
