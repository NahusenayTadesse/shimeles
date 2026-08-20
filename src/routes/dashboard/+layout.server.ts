import { and, count, eq, isNotNull, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	contactMessages,
	donations,
	formSubmissions,
	inKindDonations,
	volunteerApplications
} from '$lib/server/db/schema';
import { requireUser, pillarScope } from '$lib/server/permissions';
import type { LayoutServerLoad } from './$types';

/**
 * The dashboard shell.
 *
 * Resolves the signed-in user's access once for the whole dashboard — the
 * sidebar uses it to decide what to draw — and counts the four things a staff
 * member wants to see a badge for.
 *
 * The counts respect pillar scope. A Mental Wellness caseworker's "new
 * applications" badge counts Mental Wellness applications, not everyone's:
 * even a number is information about cases they may not see.
 */
export const load: LayoutServerLoad = async (event) => {
	const access = await requireUser(event);

	const scope = pillarScope(access, formSubmissions.pillarId);

	const [applications, volunteers, messages, pendingDonations, newInKind] = await Promise.all([
		access.permissions.has('submissions.read')
			? db
					.select({ total: count() })
					.from(formSubmissions)
					.where(
						and(
							eq(formSubmissions.isRead, false),
							isNull(formSubmissions.deletedAt),
							// Pillar-less submissions are contact messages, which have
							// their own table and their own badge now. Counting them
							// here too would show the same message in two places.
							isNotNull(formSubmissions.pillarId),
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
		// Not pillar-scoped: a general enquiry is not case data, so every staff
		// member who can read submissions sees the same message count.
		access.permissions.has('submissions.read')
			? db
					.select({ total: count() })
					.from(contactMessages)
					.where(
						and(
							eq(contactMessages.isRead, false),
							eq(contactMessages.isSpam, false),
							isNull(contactMessages.deletedAt)
						)
					)
					.then((rows) => rows[0]?.total ?? 0)
			: 0,
		access.permissions.has('donations.read')
			? db
					.select({ total: count() })
					.from(donations)
					.where(and(eq(donations.status, 'pending_reconciliation'), isNull(donations.deletedAt)))
					.then((rows) => rows[0]?.total ?? 0)
			: 0,
		// Offers nobody has looked at yet. Unlike a transfer, an offer of goods
		// goes stale — the donor is holding on to four boxes waiting for a call.
		access.permissions.has('inkind.read')
			? db
					.select({ total: count() })
					.from(inKindDonations)
					.where(and(eq(inKindDonations.status, 'offered'), isNull(inKindDonations.deletedAt)))
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
			newMessages: messages,
			pendingDonations,
			newInKind
		}
	};
};
