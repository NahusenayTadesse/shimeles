import { fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod/v4';
import { flagField } from '$lib/forms/fields';
import { auth } from '$lib/server/auth';
import { audit } from '$lib/server/audit';
import { requireUser } from '$lib/server/permissions';
import type { Actions, PageServerLoad } from './$types';

/**
 * Changing your own password.
 *
 * Not permission-gated beyond being signed in: this is the one dashboard
 * screen that is about the person rather than the Foundation's data, and a
 * caseworker who suspects their password is known needs to be able to change
 * it without waiting for an administrator. `users.manage` is what it takes to
 * create *someone else's* account, and that stays where it is.
 *
 * The change itself goes through Better Auth rather than touching the account
 * row: it verifies the current password and hashes the new one exactly as
 * `/setup` and the staff-account form do, so there is still only one place in
 * the system that knows how a password is stored.
 *
 * The floor of twelve characters and the ceiling of two hundred match `/setup`,
 * `/login` and the staff-account form. The ceiling is not cosmetic — hashing is
 * deliberately slow, so an unbounded field is free work for the server.
 */
const passwordSchema = z
	.object({
		currentPassword: z.string().min(1, 'Enter your current password').max(200),
		newPassword: z.string().min(12, 'Use at least 12 characters').max(200),
		confirmPassword: z.string().max(200),
		/**
		 * Ticked by default. Someone changing a password they think has been seen
		 * has not fixed anything while the old session is still open on the
		 * machine that saw it.
		 */
		revokeOtherSessions: flagField(true)
	})
	.refine((data) => data.newPassword === data.confirmPassword, {
		message: 'The two passwords do not match',
		path: ['confirmPassword']
	})
	.refine((data) => data.newPassword !== data.currentPassword, {
		message: 'Choose a password you are not already using',
		path: ['newPassword']
	});

export const load: PageServerLoad = async (event) => {
	await requireUser(event);

	return {
		email: event.locals.user?.email ?? null,
		/*
		 * The tick is seeded here, not left to `flagField(true)`.
		 *
		 * That default lives behind a `.transform()`, and Superforms reads its
		 * defaults from the schema's *shape* — it cannot see through the
		 * transform, so the box rendered unticked and posted `false` while the
		 * schema said `true`. The two only look like the same statement.
		 */
		form: await superValidate({ revokeOtherSessions: true }, zod4(passwordSchema), {
			errors: false
		})
	};
};

export const actions: Actions = {
	default: async (event) => {
		const access = await requireUser(event);

		const form = await superValidate(event.request, zod4(passwordSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await auth.api.changePassword({
				body: {
					currentPassword: form.data.currentPassword,
					newPassword: form.data.newPassword,
					revokeOtherSessions: form.data.revokeOtherSessions
				},
				// Better Auth reads the session from the cookie on these headers, and
				// writes the replacement cookie back through the SvelteKit cookies
				// plugin when the other sessions are revoked — which is why this page
				// does not sign the person changing their own password out.
				headers: event.request.headers,
				asResponse: false
			});
		} catch (err) {
			// The only failure worth naming: the rest could be anything, and
			// guessing in the message sends people looking in the wrong place.
			const code = (err as { body?: { code?: string } })?.body?.code;

			if (code === 'INVALID_PASSWORD') {
				return message(
					form,
					{ type: 'error', text: 'That is not your current password.' },
					{ status: 400 }
				);
			}

			console.error('password change failed', err);
			return message(
				form,
				{ type: 'error', text: 'The password could not be changed. Please try again.' },
				{ status: 500 }
			);
		}

		// The new password is never in the metadata, and neither is the old one.
		// What is worth being able to reconstruct is that the credential changed,
		// when, and from where — which the audit row already carries.
		audit({
			event,
			action: 'updated',
			entityType: 'user',
			entityId: access.userId,
			metadata: {
				field: 'password',
				self: true,
				revokedOtherSessions: form.data.revokeOtherSessions
			}
		});

		return message(form, {
			type: 'success',
			text: form.data.revokeOtherSessions
				? 'Password changed. Any other device signed in as you has been signed out.'
				: 'Password changed.'
		});
	}
};
