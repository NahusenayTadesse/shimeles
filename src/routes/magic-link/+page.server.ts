import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod/v4';
import { sql } from 'drizzle-orm';
import { emailField } from '$lib/forms/fields';
import { auth } from '$lib/server/auth';
import { audit } from '$lib/server/audit';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * "Email me a link instead."
 *
 * For the staff member who cannot remember a password and does not want to
 * change it — and for the phone in a room with no keyboard. It signs in
 * without one.
 *
 * Same reasoning as `/forgot-password` and `/login`: an endpoint anyone can
 * post to must not report whether an account exists, so the reply is one fixed
 * sentence whatever happened.
 */
const requestSchema = z.object({ email: emailField() });

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) throw redirect(302, '/dashboard');
	return {
		form: await superValidate(zod4(requestSchema)),
		// Set by Better Auth's `errorCallbackURL` when a link has been used or has
		// run out. Requesting another is the only useful response, and that is the
		// form they have just landed on.
		expired: event.url.searchParams.has('expired')
	};
};

const SENT =
	'If that email address has a Foundation account, a sign-in link is on its way. ' +
	'It expires in fifteen minutes.';

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(requestSchema));
		if (!form.valid) return fail(400, { form });

		/**
		 * The account check is ours, not Better Auth's, and it has to be.
		 *
		 * `disableSignUp` on the plugin is enforced at *verify* time — the send
		 * endpoint looks nothing up and calls `sendMagicLink` for whatever
		 * address it is given. Left to it, anybody could make the Foundation's
		 * mail account send a branded "here is your sign-in link" to any address
		 * they liked, and the recipient would follow a link that then failed. So
		 * we look the account up first and stay silent when there is none, which
		 * is what `requestPasswordReset` does internally for the same reason.
		 *
		 * A suspended account is skipped too. The link would mint a session that
		 * `requireUser` revokes on the next request, so sending one only wastes
		 * somebody's time at a moment they are already confused.
		 */
		const [account] = await db
			.select({ id: user.id, banned: user.banned, banExpires: user.banExpires })
			.from(user)
			// Addresses are stored as they were typed, so the comparison is folded
			// rather than trusting both sides to already agree on case.
			.where(sql`lower(${user.email}) = lower(${form.data.email})`)
			.limit(1);

		const suspended =
			account?.banned === true &&
			!(account.banExpires && account.banExpires.getTime() <= Date.now());

		if (account && !suspended) {
			try {
				await auth.api.signInMagicLink({
					body: {
						email: form.data.email,
						// Where Better Auth sends the browser once the token checks out.
						callbackURL: '/dashboard',
						// And where it sends them when it does not. Without this a used
						// or expired link lands on `/dashboard?error=INVALID_TOKEN`,
						// which — having no session — bounces to a bare sign-in screen
						// that says nothing about why the link did not work.
						errorCallbackURL: '/magic-link?expired=1'
					},
					headers: event.request.headers
				});
			} catch (err) {
				// A rate limit or a mail failure. Logged, never shown — staff need
				// the difference in the server log when somebody says no link came.
				console.error('magic link request failed', err);
			}
		}

		audit({
			event,
			action: 'magic_link_requested',
			entityType: 'user',
			entityId: account?.id ?? null,
			// `matched: false` is the interesting row: a run of them is what
			// somebody probing for staff addresses looks like.
			metadata: { email: form.data.email, matched: Boolean(account), suspended }
		});

		return message(form, { type: 'success', text: SENT });
	}
};
