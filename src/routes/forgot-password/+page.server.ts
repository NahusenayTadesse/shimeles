import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod/v4';
import { emailField } from '$lib/forms/fields';
import { auth } from '$lib/server/auth';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * "I have forgotten my password."
 *
 * The whole screen is one email field, and the answer is always the same
 * sentence. That is the point: this endpoint is reachable by anyone, and a
 * response that differed for a known address would turn it into an
 * account-enumeration oracle for a system holding case data — the same reason
 * `/login` gives one message for a wrong password and an unknown email.
 *
 * Better Auth's `requestPasswordReset` already answers `200` either way, so
 * the uniformity here is mostly about not *undoing* that: no "we could not
 * find that account", and the failure branch says exactly what the success
 * branch says.
 */
const requestSchema = z.object({ email: emailField() });

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) throw redirect(302, '/dashboard');
	return { form: await superValidate(zod4(requestSchema)) };
};

/** Said whatever happened, so the page cannot be used to test for an account. */
const SENT =
	'If that email address has a Foundation account, a reset link is on its way. ' +
	'It expires in an hour.';

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(requestSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await auth.api.requestPasswordReset({
				body: {
					email: form.data.email,
					// Where the link lands. Better Auth appends its own `?token=`.
					redirectTo: '/reset-password'
				},
				headers: event.request.headers
			});
		} catch (err) {
			// Logged, never shown. A mail failure and an unknown account must be
			// indistinguishable from the outside, but staff need the difference in
			// the server log when somebody says the email never arrived.
			console.error('password reset request failed', err);
		}

		audit({
			event,
			action: 'password_reset_requested',
			entityType: 'user',
			// The address as typed, not a user id — we deliberately do not look up
			// whether it matched, so there may be no user to name.
			metadata: { email: form.data.email }
		});

		return message(form, { type: 'success', text: SENT });
	}
};
