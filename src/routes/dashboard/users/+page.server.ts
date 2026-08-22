import { fail } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod/v4';
import { emailField } from '$lib/forms/fields';
import { db } from '$lib/server/db';
import { pillars, roles, session, user, userPillarAssignments } from '$lib/server/db/schema';
import { auth } from '$lib/server/auth';
import { invalidateAccess, requirePermission, ROLE } from '$lib/server/permissions';
import { audit, auditList } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * Users and their pillar scope.
 *
 * §3.10's privacy rule is only as good as this screen: `program_staff` see
 * exactly the pillars assigned here, and a member of staff with no assignments
 * sees no cases at all. That default is deliberate — a new account should start
 * with nothing and be granted access, not start with everything and be trimmed.
 *
 * What is *not* editable here, per §7: what a role can do. Roles and their
 * permission sets are code-level, because that is an access-control decision
 * rather than a content one.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'users.manage');

	const [rows, roleOptions, pillarOptions, assignments] = await Promise.all([
		db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				phone: user.phone,
				roleId: user.roleId,
				roleName: roles.name,
				roleSlug: roles.slug,
				banned: user.banned,
				preferredLanguage: user.preferredLanguage,
				createdAt: user.createdAt
			})
			.from(user)
			.leftJoin(roles, eq(roles.id, user.roleId))
			.orderBy(asc(user.name)),

		db.select().from(roles).where(eq(roles.isActive, true)).orderBy(asc(roles.name)),

		db
			.select({ id: pillars.id, name: pillars.name })
			.from(pillars)
			.where(isNull(pillars.deletedAt))
			.orderBy(asc(pillars.sortOrder)),

		db
			.select({ userId: userPillarAssignments.userId, pillarId: userPillarAssignments.pillarId })
			.from(userPillarAssignments)
			.where(and(eq(userPillarAssignments.isActive, true), isNull(userPillarAssignments.deletedAt)))
	]);

	auditList(event, 'user', { results: rows.length });

	return {
		rows: rows.map((row) => ({
			...row,
			pillarIds: assignments.filter((a) => a.userId === row.id).map((a) => a.pillarId)
		})),
		roleOptions,
		pillarOptions
	};
};

const createSchema = z.object({
	name: z.string().trim().min(2, 'Enter a name').max(150),
	email: emailField(),
	password: z.string().min(12, 'Use at least 12 characters').max(200),
	roleId: z.coerce.number().int().positive('Pick a role')
});

export const actions: Actions = {
	/**
	 * Creates a staff account through Better Auth, so the password is hashed the
	 * same way it would be at signup. The public signup endpoint is blocked in
	 * `hooks.server.ts`; this is the only way an account comes into existence
	 * after the first one.
	 */
	create: async (event) => {
		await requirePermission(event, 'users.manage');
		const parsed = createSchema.safeParse(Object.fromEntries(await event.request.formData()));

		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0]?.message ?? 'Check the details.' });
		}

		try {
			await auth.api.signUpEmail({
				body: {
					name: parsed.data.name,
					email: parsed.data.email,
					password: parsed.data.password
				},
				headers: event.request.headers,
				asResponse: false
			});
		} catch (err) {
			console.error('user create failed', err);
			return fail(409, { error: 'That email address is already in use.' });
		}

		const [role] = await db
			.select({ slug: roles.slug })
			.from(roles)
			.where(eq(roles.id, parsed.data.roleId))
			.limit(1);

		await db
			.update(user)
			.set({ roleId: parsed.data.roleId, role: role?.slug ?? null, emailVerified: true })
			.where(eq(user.email, parsed.data.email));

		audit({ event, action: 'created', entityType: 'user', metadata: { email: parsed.data.email } });
		return { ok: true };
	},

	setRole: async (event) => {
		const access = await requirePermission(event, 'users.manage');
		const formData = await event.request.formData();
		const userId = String(formData.get('userId') ?? '');
		const roleId = Number(formData.get('roleId'));

		if (!userId || !Number.isFinite(roleId)) return fail(400, { error: 'Unknown user or role.' });

		// Demoting yourself out of super admin can leave a system nobody can
		// administer. Refuse it rather than let someone lock themselves out.
		if (userId === access.userId) {
			const [role] = await db
				.select({ slug: roles.slug })
				.from(roles)
				.where(eq(roles.id, roleId))
				.limit(1);
			if (access.isSuperAdmin && role?.slug !== ROLE.SUPER_ADMIN) {
				return fail(422, {
					error: 'You cannot remove your own administrator access. Ask another admin to do it.'
				});
			}
		}

		const [role] = await db
			.select({ slug: roles.slug })
			.from(roles)
			.where(eq(roles.id, roleId))
			.limit(1);

		await db
			.update(user)
			.set({ roleId, role: role?.slug ?? null, updatedAt: new Date() })
			.where(eq(user.id, userId));

		// A permission change has to bite on the next request, not after a TTL.
		invalidateAccess(userId);
		audit({ event, action: 'updated', entityType: 'user', entityId: userId, metadata: { roleId } });

		return { ok: true };
	},

	/**
	 * Sets the whole pillar assignment list for one user in a single write, so
	 * a partial failure cannot leave someone with access to a pillar they were
	 * just removed from.
	 */
	setPillars: async (event) => {
		const access = await requirePermission(event, 'users.manage');
		const formData = await event.request.formData();
		const userId = String(formData.get('userId') ?? '');
		const pillarIds = formData.getAll('pillarIds').map(Number).filter(Number.isFinite);

		if (!userId) return fail(400, { error: 'Unknown user.' });

		db.transaction((tx) => {
			tx.delete(userPillarAssignments).where(eq(userPillarAssignments.userId, userId)).run();

			for (const pillarId of pillarIds) {
				tx.insert(userPillarAssignments)
					.values({ userId, pillarId, createdBy: access.userId, updatedBy: access.userId })
					.run();
			}
		});

		invalidateAccess(userId);
		audit({
			event,
			action: 'updated',
			entityType: 'user',
			entityId: userId,
			metadata: { pillarIds }
		});

		return { ok: true };
	},

	setBanned: async (event) => {
		const access = await requirePermission(event, 'users.manage');
		const formData = await event.request.formData();
		const userId = String(formData.get('userId') ?? '');
		const banned = String(formData.get('banned')) === 'true';

		if (userId === access.userId) {
			return fail(422, { error: 'You cannot suspend your own account.' });
		}

		await db
			.update(user)
			.set({
				banned,
				banReason: banned ? 'Suspended by an administrator' : null,
				// Cleared alongside the flag: a stale expiry left behind on an
				// unbanned account would re-suspend nobody, but a stale one left on a
				// *re*-banned account would silently expire the new suspension.
				banExpires: null
			})
			.where(eq(user.id, userId));

		// Suspension has to end the sessions the account already holds, not just
		// refuse the next request. `requireUser` catches those too, but `/files`
		// and anything else reading `loadAccess` directly are safer with the
		// session gone. Better Auth's own `revokeUserSessions` lives in the
		// `admin` plugin, which this project does not load, so the rows go here.
		if (banned) {
			await db.delete(session).where(eq(session.userId, userId));
		}

		invalidateAccess(userId);
		audit({ event, action: 'updated', entityType: 'user', entityId: userId, metadata: { banned } });

		return { ok: true };
	}
};
