import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { donations, formSubmissions, volunteerApplications } from '$lib/server/db/schema';
import { requireUser, pillarScope } from '$lib/server/permissions';
import type { LayoutServerLoad } from './$types';

/**
 * The dashboard shell.
 *
 * Resolves the signed-in user's access once for the whole dashboard — the
 * sidebar uses it to decide what to draw — and counts the three things a staff
 * member wants to see a badge for.
 *
 * The counts respect pillar scope. A Mental Wellness caseworker's "new
 * applications" badge counts Mental Wellness applications, not everyone's:
 * even a number is information about cases they may not see.
 */
export const load: LayoutServerLoad = async (event) => {
	const access = await requireUser(event);

	const scope = pillarScope(access, formSubmissions.pillarId);

	const [applications, volunteers, pendingDonations] = await Promise.all([
		access.permissions.has('submissions.read')
			? db
					.select({ total: count() })
					.from(formSubmissions)
					.where(
						and(
							eq(formSubmissions.isRead, false),
							isNull(formSubmissions.deletedAt),
							...(scope ? [scope] : [])
						)
					)
					.then((rows) => rows[0]?.total ?? 0)
			: 0,
		access.permissions.has('volunteers.read')
			? db
					.select({ total: count() })
					.from(volunteerApplications)
					.where(
						and(eq(volunteerApplications.isRead, false), isNull(volunteerApplications.deletedAt))
					)
					.then((rows) => rows[0]?.total ?? 0)
			: 0,
		access.permissions.has('donations.read')
			? db
					.select({ total: count() })
					.from(donations)
					.where(and(eq(donations.status, 'pending_reconciliation'), isNull(donations.deletedAt)))
					.then((rows) => rows[0]?.total ?? 0)
			: 0
	]);

	return {
		access: {
			userId: access.userId,
			roleName: access.roleName,
			isSuperAdmin: access.isSuperAdmin,
			// A Set does not survive serialisation across the load boundary.
			permissions: [...access.permissions],
			pillarIds: access.pillarIds
		},
		counts: {
			newApplications: applications,
			newVolunteers: volunteers,
			pendingDonations
		}
	};
};
