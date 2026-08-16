import { error, redirect } from '@sveltejs/kit';
import { count, eq } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { z } from 'zod/v4';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { roles, user } from '$lib/server/db/schema';
import { ROLE } from '$lib/permissions';
import type { Actions, PageServerLoad } from './$types';

/**
 * First-run setup.
 *
 * The seed script deliberately does not create a staff account: a password
 * hash committed to a repository is a vulnerability with a long tail. Instead
 * the first administrator is created here, through Better Auth, so the
 * credential is hashed exactly as any later signup would be.
 *
 * The route closes itself permanently the moment one account exists. It is not
 * permission-gated — it cannot be, since nobody can sign in yet — so "are there
 * zero users?" is the only thing standing between this form and the internet,
 * and it has to be checked in both the load and the action.
 */
const setupSchema = z
	.object({
		name: z.string().trim().min(2, 'Enter your name').max(150),
		email: z.email('Enter a valid email address'),
		password: z.string().min(12, 'Use at least 12 characters').max(200),
		confirmPassword: z.string()
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: 'The two passwords do not match',
		path: ['confirmPassword']
	});

const isFirstRun = async () => {
	const [{ total }] = await db.select({ total: count() }).from(user);
	return total === 0;
};

export const load: PageServerLoad = async () => {
	if (!(await isFirstRun())) throw redirect(302, '/login');
	return { form: await superValidate(zod4(setupSchema)) };
};

export const actions: Actions = {
	default: async (event) => {
		// Re-checked here, not just in the load: a stale open tab must not be able
		// to mint a second super admin.
		if (!(await isFirstRun())) throw error(403, 'Setup has already been completed.');

		const form = await superValidate(event.request, zod4(setupSchema));
		if (!form.valid) {
			return message(form, { type: 'error', text: 'Please check the form.' }, { status: 400 });
		}

		const [superAdmin] = await db
			.select({ id: roles.id })
			.from(roles)
			.where(eq(roles.slug, ROLE.SUPER_ADMIN))
			.limit(1);

		if (!superAdmin) {
			return message(
				form,
				{ type: 'error', text: 'Roles have not been seeded yet. Run `bun run db:seed` first.' },
				{ status: 500 }
			);
		}

		try {
			await auth.api.signUpEmail({
				body: { name: form.data.name, email: form.data.email, password: form.data.password },
				headers: event.request.headers,
				asResponse: false
			});
		} catch (err) {
			console.error('setup signup failed', err);
			return message(
				form,
				{ type: 'error', text: 'Could not create the account.' },
				{ status: 500 }
			);
		}

		await db
			.update(user)
			.set({ roleId: superAdmin.id, role: ROLE.SUPER_ADMIN, emailVerified: true })
			.where(eq(user.email, form.data.email));

		throw redirect(302, '/dashboard');
	}
};
