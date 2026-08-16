import { asc, count, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { permissions, rolePermissions, roles, user } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { ROLE_PERMISSIONS, PERMISSIONS } from '$lib/permissions';
import { auditList } from '$lib/server/audit';
import type { PageServerLoad } from './$types';

/**
 * Roles, read-only.
 *
 * §7 is explicit: who *can* be a `program_staff` is dashboard-editable (that is
 * the users screen); what a `program_staff` *can do* is not, because that is an
 * access-control decision rather than a content one. So this screen explains
 * what each role holds rather than offering to change it — a permission grid
 * that looked editable but was overwritten by the next seed run would be worse
 * than no grid at all.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'users.manage');

	const [roleRows, grants, counts] = await Promise.all([
		db.select().from(roles).orderBy(asc(roles.name)),

		db
			.select({
				roleSlug: roles.slug,
				permission: permissions.name,
				description: permissions.description,
				group: permissions.group
			})
			.from(rolePermissions)
			.innerJoin(roles, eq(roles.id, rolePermissions.roleId))
			.innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
			.orderBy(asc(permissions.group), asc(permissions.name)),

		db.select({ roleId: user.roleId, total: count() }).from(user).groupBy(user.roleId)
	]);

	auditList(event, 'role');

	return {
		roles: roleRows.map((role) => ({
			...role,
			userCount: counts.find((row) => row.roleId === role.id)?.total ?? 0,
			// A super admin's grant is a wildcard resolved in code, so it has no
			// explicit rows — spell it out rather than showing an empty list.
			permissions:
				role.slug === 'super_admin'
					? Object.entries(PERMISSIONS).map(([name, meta]) => ({
							permission: name,
							description: meta.description,
							group: meta.group
						}))
					: grants.filter((grant) => grant.roleSlug === role.slug)
		})),
		definedInCode: ROLE_PERMISSIONS
	};
};
