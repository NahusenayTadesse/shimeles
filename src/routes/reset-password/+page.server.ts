import { fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod/v4';
import { auth } from '$lib/server/auth';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * Choosing a new password, from the link in the reset email.
 *
 * The floor of twelve characters and the ceiling of two hundred match
 * `/setup`, `/login`, `/dashboard/password` and the staff-account form. The
 * ceiling is not cosmetic — hashing is deliberately slow, so an unbounded
 * field is free work for the server on an unauthenticated request.
 *
 * The token rides in a hidden field rather than being re-read from the URL at
 * submit time, so the value that was validated on the way in is the value that
 * is used.
 */
const resetSchema = z
	.object({
		token: z.string().min(1),
		newPassword: z.string().min(12, 'Use at least 12 characters').max(200),
		confirmPassword: z.string().max(200)
	})
	.refine((data) => data.newPassword === data.confirmPassword, {
		message: 'The two passwords do not match',
		path: ['confirmPassword']
	});

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) throw redirect(302, '/dashboard');

	const token = event.url.searchParams.get('token') ?? '';
	const form = await superValidate(zod4(resetSchema));
	form.data.token = token;

	// A missing token means the link was mangled in transit — a mail client
	// wrapping a long URL is the usual cause. Say so here rather than showing a
	// password form that cannot possibly work.
	return { form, hasToken: Boolean(token) };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(resetSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await auth.api.resetPassword({
				body: { token: form.data.token, newPassword: form.data.newPassword },
				headers: event.request.headers
			});
		} catch {
			// An expired token, an already-used one and a forged one all land here
			// and all get the same sentence. There is nothing useful to tell them
			// apart for, and the honest advice is identical in every case.
			return message(
				form,
				{
					type: 'error',
					text: 'That reset link is no longer valid. Request a new one and use it within the hour.'
				},
				{ status: 400 }
			);
		}

		audit({ event, action: 'password_reset', entityType: 'user' });

		// Not signed in on the way out, deliberately: `revokeSessionsOnPasswordReset`
		// has just ended every session, and the person should prove the new
		// password works while they still remember choosing it.
		throw redirect(303, '/login?reset=1');
	}
};
