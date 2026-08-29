import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	pillars,
	regions,
	statusOptions,
	volunteerApplications,
	volunteerApplicationSkills,
	volunteerAvailability,
	volunteerInterests,
	volunteerSkills,
	volunteerTimeSlots
} from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import {
	ensureInvite,
	inviteUrl,
	regenerateInviteToken,
	saveInviteSettings,
	sendInvite
} from '$lib/server/volunteer-invites';
import { sanitiseHiddenParts } from '$lib/volunteer-form-parts';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * One volunteer's page: composing their form, and sending it.
 *
 * It used to be the review screen — the safeguarding checklist, licence
 * verification, reference outcomes, the status picker, placements. All of that
 * now lives in the row on `/dashboard/volunteers`, because a handful of people
 * working through a queue should not have to open a page, scroll to a control
 * and come back for the next person.
 *
 * What is left is the one job a table row cannot hold: deciding what to ask
 * this particular volunteer, and getting the link to them. The summary above it
 * is read-only and exists so that whoever is composing the form can see who
 * they are composing it for.
 *
 * **Nothing that was a control moved anywhere weaker.** `setVolunteerStatus` is
 * still the only path to a status and still refuses an approved stage while
 * safeguarding is incomplete; it is simply called from the list page's action
 * now instead of this one's.
 */
async function guard(
	event: RequestEvent<{ id: string }>,
	permission: 'volunteers.read' | 'volunteers.write'
) {
	const access = await requirePermission(event, permission);
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(404, 'Not found');

	const [application] = await db
		.select({
			id: volunteerApplications.id,
			reference: volunteerApplications.referenceNumber,
			fullName: volunteerApplications.fullName,
			email: volunteerApplications.email,
			phone: volunteerApplications.phone,
			city: volunteerApplications.city,
			motivation: volunteerApplications.motivation,
			createdAt: volunteerApplications.createdAt,
			safeguardingComplete: volunteerApplications.safeguardingChecklistComplete,
			statusLabel: statusOptions.label,
			statusColor: statusOptions.color,
			regionName: regions.name
		})
		.from(volunteerApplications)
		.leftJoin(statusOptions, eq(statusOptions.id, volunteerApplications.statusId))
		.leftJoin(regions, eq(regions.id, volunteerApplications.regionId))
		.where(and(eq(volunteerApplications.id, id), isNull(volunteerApplications.deletedAt)))
		.limit(1);

	if (!application) throw error(404, 'That volunteer application does not exist.');

	return { access, id, application };
}

export const load: PageServerLoad = async (event) => {
	const { access, id, application } = await guard(event, 'volunteers.read');

	const [invite, interests, skills, availability] = await Promise.all([
		ensureInvite(id, access.userId),
		db
			.select({ name: pillars.name })
			.from(volunteerInterests)
			.innerJoin(pillars, eq(pillars.id, volunteerInterests.pillarId))
			.where(eq(volunteerInterests.volunteerApplicationId, id))
			.orderBy(asc(pillars.sortOrder)),
		db
			.select({ name: volunteerSkills.name })
			.from(volunteerApplicationSkills)
			.innerJoin(volunteerSkills, eq(volunteerSkills.id, volunteerApplicationSkills.skillId))
			.where(eq(volunteerApplicationSkills.volunteerApplicationId, id)),
		db
			.select({ label: volunteerTimeSlots.label })
			.from(volunteerAvailability)
			.innerJoin(volunteerTimeSlots, eq(volunteerTimeSlots.id, volunteerAvailability.timeSlotId))
			.where(eq(volunteerAvailability.volunteerApplicationId, id))
	]);

	audit({
		event,
		action: 'viewed',
		entityType: 'volunteer_application',
		entityId: id,
		metadata: { reference: application.reference }
	});

	return {
		crumb: [application.reference, application.fullName].filter(Boolean).join(' · '),
		application,
		interests: interests.map((row) => row.name),
		skills: skills.map((row) => row.name),
		availability: availability.map((row) => row.label),
		invite: {
			isActive: invite.isActive,
			hiddenParts: invite.hiddenParts ?? [],
			sentAt: invite.sentAt,
			completedAt: invite.completedAt,
			url: inviteUrl(invite.token)
		}
	};
};

export const actions: Actions = {
	/** The show/hide list and the on/off switch, saved together. */
	save: async (event) => {
		const { access, id } = await guard(event, 'volunteers.write');
		const formData = await event.request.formData();

		// The posted list is what to *hide*. Sanitised against the catalogue, so
		// a key that is not a real part — including one naming a locked section —
		// is dropped rather than stored.
		const hiddenParts = sanitiseHiddenParts(formData.getAll('hidden').map(String));
		const isActive = formData.get('isActive') === 'true';

		const invite = await saveInviteSettings(event, id, { hiddenParts, isActive }, access.userId);

		return { ok: true, isActive: invite.isActive };
	},

	/** Emails the link to the volunteer's own address. */
	send: async (event) => {
		const { access, id } = await guard(event, 'volunteers.write');
		const result = await sendInvite(event, id, access.userId);

		if (!result.sent) {
			const reasons: Record<string, string> = {
				'no-email':
					'This volunteer did not leave an email address. Copy the link and text it instead.',
				inactive: 'The link is switched off, so there is nothing to send. Turn it on first.',
				'no-smtp-host': 'No mail server is configured, so nothing was sent.',
				'no-recipient': 'There is no address to send to.'
			};

			return fail(400, {
				error: reasons[result.reason ?? ''] ?? 'The email could not be sent. Please try again.'
			});
		}

		return { ok: true, sent: true };
	},

	/**
	 * Issues a new token and invalidates the one already sent.
	 *
	 * The only way to take back a link that reached the wrong person: switching
	 * it off closes the form, but the URL itself keeps working the moment it is
	 * switched back on.
	 */
	regenerate: async (event) => {
		const { access, id } = await guard(event, 'volunteers.write');
		const invite = await regenerateInviteToken(event, id, access.userId);
		return { ok: true, url: inviteUrl(invite.token) };
	}
};
