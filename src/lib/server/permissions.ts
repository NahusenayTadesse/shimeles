import { error, redirect } from '@sveltejs/kit';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import type { SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { auth } from '$lib/server/auth';
import {
	permissions,
	rolePermissions,
	roles,
	specialPermissions,
	user as userTable,
	userPillarAssignments
} from '$lib/server/db/schema';
import { cached, invalidate } from '$lib/server/cache';
import { ROLE, PERMISSIONS, type Permission, type RoleSlug } from '$lib/permissions';
import { audit } from '$lib/server/audit';

export { ROLE, PERMISSIONS, ROLE_PERMISSIONS } from '$lib/permissions';
export type { Permission, RoleSlug } from '$lib/permissions';

/* ==========================================================================
   Loading a user's effective access
   ========================================================================== */

export interface Access {
	userId: string;
	roleSlug: RoleSlug | null;
	roleName: string | null;
	isSuperAdmin: boolean;
	/**
	 * Whether the account is currently suspended.
	 *
	 * Read here rather than left to Better Auth: this project runs
	 * `betterAuth/minimal` without the `admin` plugin, so nothing in the auth
	 * layer looks at `user.banned` — a suspended account's session keeps working
	 * until something on our side refuses it. `requireUser` is that something.
	 */
	isBanned: boolean;
	permissions: Set<Permission>;
	/**
	 * Pillar ids this user may see case data for. `null` means "all pillars" —
	 * only a `super_admin` or a user with no assignments *and* no pillar-scoped
	 * role gets that. An empty array means "none", which is the safe reading of
	 * a `program_staff` who has not been assigned anything yet.
	 */
	pillarIds: number[] | null;
}

/**
 * Resolves the full access picture for one user: role, effective permissions
 * (role grants plus individual grants), and pillar scope.
 *
 * Cached briefly and keyed by user id. Any write to roles, permissions or
 * assignments calls `invalidateAccess`, so a revoked permission takes effect
 * on the next request rather than after a TTL.
 */
export function loadAccess(userId: string): Promise<Access> {
	return cached(
		`access:${userId}`,
		async () => {
			const [row] = await db
				.select({
					roleSlug: roles.slug,
					roleName: roles.name,
					roleActive: roles.isActive,
					banned: userTable.banned,
					banExpires: userTable.banExpires
				})
				.from(userTable)
				.leftJoin(roles, eq(roles.id, userTable.roleId))
				.where(eq(userTable.id, userId))
				.limit(1);

			const roleSlug = (
				row?.roleActive === false ? null : (row?.roleSlug ?? null)
			) as RoleSlug | null;
			const isSuperAdmin = roleSlug === ROLE.SUPER_ADMIN;

			// `banned` is nullable — null for an account never suspended. A
			// `banExpires` in the past is a suspension that has run its course;
			// null means it does not expire.
			const isBanned =
				row?.banned === true && !(row.banExpires && row.banExpires.getTime() <= Date.now());

			const [granted, extra, assignments] = await Promise.all([
				roleSlug
					? db
							.select({ name: permissions.name })
							.from(rolePermissions)
							.innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
							.innerJoin(roles, eq(roles.id, rolePermissions.roleId))
							.where(
								and(
									eq(roles.slug, roleSlug),
									eq(rolePermissions.isActive, true),
									isNull(rolePermissions.deletedAt)
								)
							)
					: Promise.resolve([]),
				db
					.select({ name: permissions.name })
					.from(specialPermissions)
					.innerJoin(permissions, eq(permissions.id, specialPermissions.permissionId))
					.where(
						and(
							eq(specialPermissions.userId, userId),
							eq(specialPermissions.isActive, true),
							isNull(specialPermissions.deletedAt)
						)
					),
				db
					.select({ pillarId: userPillarAssignments.pillarId })
					.from(userPillarAssignments)
					.where(
						and(
							eq(userPillarAssignments.userId, userId),
							eq(userPillarAssignments.isActive, true),
							isNull(userPillarAssignments.deletedAt)
						)
					)
			]);

			const effective = new Set<Permission>(
				[...granted, ...extra].map((p) => p.name as Permission)
			);
			if (isSuperAdmin)
				for (const name of Object.keys(PERMISSIONS)) effective.add(name as Permission);

			return {
				userId,
				roleSlug,
				roleName: row?.roleName ?? null,
				isSuperAdmin,
				isBanned,
				permissions: effective,
				// A super admin sees every pillar. Everyone else sees exactly what they
				// have been assigned — including nothing, which is the correct default
				// for a newly created account.
				pillarIds: isSuperAdmin ? null : assignments.map((a) => a.pillarId)
			} satisfies Access;
		},
		30_000
	);
}

/** Call after any change to a user's role, permissions or pillar assignments. */
export const invalidateAccess = (userId?: string) =>
	invalidate(userId ? `access:${userId}` : 'access');

/* ==========================================================================
   Guards
   ========================================================================== */

/**
 * The standard opening line of every dashboard `load` and action: proves there
 * is a session, resolves access, and enforces one required permission.
 *
 * Denials are audited. A `program_staff` probing the finance routes is exactly
 * the kind of thing the log exists to show.
 */
export async function requirePermission(
	event: RequestEvent,
	permission: Permission
): Promise<Access> {
	const access = await requireUser(event);
	if (!access.permissions.has(permission)) {
		audit({
			event,
			action: 'permission_denied',
			entityType: 'user',
			entityId: access.userId,
			metadata: { permission, path: event.url.pathname }
		});
		throw error(403, 'You do not have access to this area.');
	}
	return access;
}

/**
 * Session check alone, for screens every signed-in staff member may open.
 *
 * Also the one place a suspension is enforced. Better Auth is running without
 * its `admin` plugin, so it happily keeps honouring the session cookie of an
 * account someone has just suspended; refusing here means a suspension takes
 * effect on the suspended user's *next request* rather than whenever their
 * session happens to expire.
 *
 * The session is ended rather than merely refused. A bare 403 would be a dead
 * end: the only sign-out control in the app is an action on `/dashboard`, which
 * is itself behind this guard, so a suspended user would have no way out and
 * `/login` would bounce them back here on the still-valid cookie.
 */
export async function requireUser(event: RequestEvent): Promise<Access> {
	if (!event.locals.user) {
		throw redirect(302, `/login?redirectTo=${encodeURIComponent(event.url.pathname)}`);
	}

	const access = await loadAccess(event.locals.user.id);

	if (access.isBanned) {
		audit({
			event,
			action: 'permission_denied',
			entityType: 'user',
			entityId: access.userId,
			metadata: { reason: 'account_suspended', path: event.url.pathname }
		});

		try {
			await auth.api.signOut({ headers: event.request.headers });
		} catch (err) {
			// The refusal is the control; clearing the cookie is a courtesy. If it
			// fails, the next request is refused here again.
			console.error('sign-out of suspended account failed', err);
		}

		throw redirect(302, '/login?suspended=1');
	}

	return access;
}

/**
 * Non-throwing check, for hiding a nav item the user cannot use anyway.
 *
 * A suspended account holds no permission at all, so a stale `Access` handed to
 * a component cannot draw a link the guard would refuse.
 */
export const can = (access: Access | null | undefined, permission: Permission) =>
	(access && !access.isBanned && access.permissions.has(permission)) ?? false;

/* ==========================================================================
   Pillar scoping
   ========================================================================== */

/**
 * The §3.10 hard rule, as a query fragment.
 *
 * "Program staff scoped to Mental Wellness must not see Medical Hardship case
 * notes or documents" is implemented here — as a WHERE clause folded into
 * every case query — rather than as a hidden column in the UI. A direct POST
 * to an action, a CSV export, or a URL with someone else's submission id all
 * pass through the same predicate.
 *
 * Returns `undefined` when the user is unrestricted, so callers can spread it
 * into `and(...)` without a branch.
 */
export function pillarScope(access: Access, column: { name: string } & object): SQL | undefined {
	if (access.pillarIds === null) return undefined;
	if (access.pillarIds.length === 0) {
		// No assignments means no cases — never "all cases".
		return sql`0 = 1`;
	}
	// Submissions against a form with no pillar (the contact form) carry a null
	// pillar_id and belong to nobody's pillar scope; they are reachable through
	// the contact screen, which checks its own permission.
	return inArray(column as never, access.pillarIds);
}

/**
 * Throws unless the user may touch a record belonging to `pillarId`.
 *
 * Used by the detail routes and every mutating action, where the record is
 * fetched by id and the scope cannot be expressed as a list filter.
 */
export function assertPillarAccess(
	event: RequestEvent,
	access: Access,
	pillarId: number | null | undefined
): void {
	if (access.pillarIds === null) return;
	if (pillarId != null && access.pillarIds.includes(pillarId)) return;

	audit({
		event,
		action: 'permission_denied',
		entityType: 'user',
		entityId: access.userId,
		metadata: { reason: 'pillar_scope', pillarId, path: event.url.pathname }
	});
	throw error(403, 'This case belongs to a programme you do not have access to.');
}

/** Convenience for `or(...)` when a record may legitimately have no pillar. */
export const pillarScopeOrNull = (
	access: Access,
	column: { name: string } & object
): SQL | undefined => {
	const scope = pillarScope(access, column);
	if (!scope) return undefined;
	return or(scope, isNull(column as never));
};
