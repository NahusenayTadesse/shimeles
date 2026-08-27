import { fail, redirect } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod/v4';
import { emailField } from '$lib/forms/fields';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * The password is capped as well as floored. Better Auth hashes whatever it is
 * given, and hashing is deliberately slow — an unbounded password field is a
 * free way to make the server do arbitrary work on an unauthenticated request.
 * The ceiling matches `/setup` and the staff-account form.
 */
const loginSchema = z.object({
	email: emailField(),
	password: z.string().min(1, 'Enter your password').max(200, 'That password is too long')
});

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) throw redirect(302, '/dashboard');

	// A fresh install has no accounts at all; sending the first person to the
	// login form would leave them with nothing to log in with.
	const [{ total }] = await db.select({ total: count() }).from(user);
	if (total === 0) throw redirect(302, '/setup');

	return {
		form: await superValidate(zod4(loginSchema)),
		// Set by `requireUser` when it signs a suspended account out. Signing in
		// again will not help, so say why rather than leaving them to guess.
		suspended: event.url.searchParams.has('suspended'),
		// Set by `/reset-password` on its way out. Every session was revoked, so
		// the form is expected — but arriving at a bare login screen after
		// successfully choosing a password reads as though it did not work.
		reset: event.url.searchParams.has('reset')
	};
};

export const actions: Actions = {
	default: async (event) => {
		const form = await superValidate(event.request, zod4(loginSchema));
		if (!form.valid) return fail(400, { form });

		try {
			await auth.api.signInEmail({
				body: { email: form.data.email, password: form.data.password },
				headers: event.request.headers,
				asResponse: false
			});
		} catch {
			// Deliberately identical for an unknown email and a wrong password:
			// distinguishing them turns the login form into an account-enumeration
			// oracle for a system holding case data.
			return message(
				form,
				{ type: 'error', text: 'That email and password did not match.' },
				{ status: 401 }
			);
		}

		// Resolved explicitly: `event.locals` was populated before this action ran
		// and still holds no user, so without this the audit row for a sign-in
		// names nobody.
		const [signedIn] = await db
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, form.data.email))
			.limit(1);

		audit({
			event,
			action: 'login',
			entityType: 'user',
			entityId: signedIn?.id ?? null,
			userId: signedIn?.id ?? null,
			metadata: { email: form.data.email }
		});

		// Only same-origin paths — an open redirect on a login form is a
		// ready-made phishing step.
		//
		// `startsWith('/')` is not enough on its own: `//evil.com` and `/\evil.com`
		// both start with a slash and both are resolved by browsers as an absolute
		// URL to another host, so the second character has to be excluded too.
		const redirectTo = event.url.searchParams.get('redirectTo');
		const isSameOrigin = Boolean(redirectTo && /^\/(?![/\\])/.test(redirectTo));

		throw redirect(302, isSameOrigin ? redirectTo! : '/dashboard');
	}
};
