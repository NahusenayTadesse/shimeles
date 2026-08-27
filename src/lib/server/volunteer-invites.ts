import { randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { volunteerApplications, volunteerInvites } from '$lib/server/db/schema';
import { sanitiseHiddenParts } from '$lib/volunteer-form-parts';
import { audit } from '$lib/server/audit';
import { sendEmail, volunteerDetailsInviteTemplate } from '$lib/server/email';
import { DEFAULT_ORIGIN } from '$lib/server/email-templates';

/**
 * The link a coordinator sends a volunteer to finish their application.
 *
 * One row per application (§3.6e). It carries three things: a token nobody can
 * guess, a switch that decides whether the link opens a form or a 404, and the
 * coordinator's judgement about which optional parts of the form this
 * particular person should be asked.
 */

/**
 * 24 random bytes, base64url — 192 bits, and URL-safe without escaping.
 *
 * Not a UUID: a v4 UUID carries 122 bits and, more to the point, *looks* like
 * an identifier, which invites someone to try incrementing it. This link opens
 * a form that writes to a named person's file, so the token is the only thing
 * standing between a stranger and that file.
 */
const newToken = () => randomBytes(24).toString('base64url');

/**
 * The origin a completion link is built from.
 *
 * `ORIGIN`, not `site.url` — the same exception the password-reset link makes,
 * and for the same reason: the token at the end of this URL is verified by the
 * running server, so the link has to name the origin actually serving the app.
 * Every *other* email in this codebase uses `site.url`.
 */
export const inviteUrl = (token: string) =>
	`${(env.ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '')}/volunteer/continue/${token}`;

export type Invite = typeof volunteerInvites.$inferSelect;

/** The invite on one application, or null if nobody has made one yet. */
export async function getInvite(applicationId: number): Promise<Invite | null> {
	const [row] = await db
		.select()
		.from(volunteerInvites)
		.where(eq(volunteerInvites.volunteerApplicationId, applicationId))
		.limit(1);

	return row ?? null;
}

/**
 * The invite, created on first use.
 *
 * A coordinator opening the form editor is already deciding to send someone a
 * link, so the row is made then rather than behind a separate "create" button
 * that would only ever be pressed once. It starts inactive-safe: active, but
 * with nothing sent and nobody told, so the link exists only where the
 * coordinator can see it.
 */
export async function ensureInvite(applicationId: number, userId: string | null): Promise<Invite> {
	const existing = await getInvite(applicationId);
	if (existing) return existing;

	const [created] = await db
		.insert(volunteerInvites)
		.values({
			volunteerApplicationId: applicationId,
			token: newToken(),
			createdBy: userId
		})
		.returning();

	return created;
}

/** Which parts of the form this volunteer will be asked, and whether the link works. */
export async function saveInviteSettings(
	event: RequestEvent,
	applicationId: number,
	input: { hiddenParts: string[]; isActive: boolean },
	userId: string | null
): Promise<Invite> {
	const invite = await ensureInvite(applicationId, userId);
	const hiddenParts = sanitiseHiddenParts(input.hiddenParts);

	const [updated] = await db
		.update(volunteerInvites)
		.set({ hiddenParts, isActive: input.isActive, updatedAt: new Date() })
		.where(eq(volunteerInvites.id, invite.id))
		.returning();

	audit({
		event,
		action: 'updated',
		entityType: 'volunteer_invite',
		entityId: invite.id,
		metadata: {
			applicationId,
			isActive: input.isActive,
			hiddenParts
		}
	});

	return updated;
}

/**
 * Issues a new token, invalidating the one already sent.
 *
 * For the case a coordinator cannot undo any other way: a link forwarded to the
 * wrong person. Deactivating closes the form; only a new token makes the old
 * URL meaningless.
 */
export async function regenerateInviteToken(
	event: RequestEvent,
	applicationId: number,
	userId: string | null
): Promise<Invite> {
	const invite = await ensureInvite(applicationId, userId);

	const [updated] = await db
		.update(volunteerInvites)
		.set({ token: newToken(), sentAt: null, updatedAt: new Date() })
		.where(eq(volunteerInvites.id, invite.id))
		.returning();

	audit({
		event,
		action: 'updated',
		entityType: 'volunteer_invite',
		entityId: invite.id,
		metadata: { applicationId, regenerated: true }
	});

	return updated;
}

/**
 * Emails the link to the volunteer.
 *
 * Fails loudly rather than silently, unlike the acknowledgement on the public
 * form: a coordinator pressing "Send" is waiting to know whether it went, and
 * "sent" over a dead SMTP connection would have them waiting for a reply to an
 * email nobody received.
 */
export async function sendInvite(
	event: RequestEvent,
	applicationId: number,
	userId: string | null
): Promise<{ sent: boolean; reason?: string }> {
	const [application] = await db
		.select({
			fullName: volunteerApplications.fullName,
			email: volunteerApplications.email
		})
		.from(volunteerApplications)
		.where(
			and(eq(volunteerApplications.id, applicationId), isNull(volunteerApplications.deletedAt))
		)
		.limit(1);

	if (!application) return { sent: false, reason: 'no-application' };
	if (!application.email) return { sent: false, reason: 'no-email' };

	const invite = await ensureInvite(applicationId, userId);
	if (!invite.isActive) return { sent: false, reason: 'inactive' };

	const result = await sendEmail({
		to: application.email,
		...volunteerDetailsInviteTemplate({
			name: application.fullName,
			url: inviteUrl(invite.token)
		})
	});

	if (!result.sent) return { sent: false, reason: result.reason };

	await db
		.update(volunteerInvites)
		.set({ sentAt: new Date(), updatedAt: new Date() })
		.where(eq(volunteerInvites.id, invite.id));

	audit({
		event,
		action: 'notified',
		entityType: 'volunteer_invite',
		entityId: invite.id,
		metadata: { applicationId, to: application.email }
	});

	return { sent: true };
}

/**
 * The application behind a token, or null.
 *
 * Null for an unknown token, a deactivated link and a deleted application
 * alike. The route turns all three into the same 404, so a link that has been
 * switched off is indistinguishable from one that never existed — a coordinator
 * who deactivates a link has withdrawn it, and "this was real but you may not
 * have it any more" is more than they chose to say.
 */
export async function findActiveInvite(token: string) {
	if (!token) return null;

	const [row] = await db
		.select({
			inviteId: volunteerInvites.id,
			hiddenParts: volunteerInvites.hiddenParts,
			completedAt: volunteerInvites.completedAt,
			applicationId: volunteerApplications.id,
			fullName: volunteerApplications.fullName,
			reference: volunteerApplications.referenceNumber
		})
		.from(volunteerInvites)
		.innerJoin(
			volunteerApplications,
			eq(volunteerApplications.id, volunteerInvites.volunteerApplicationId)
		)
		.where(
			and(
				eq(volunteerInvites.token, token),
				eq(volunteerInvites.isActive, true),
				isNull(volunteerApplications.deletedAt)
			)
		)
		.limit(1);

	return row ?? null;
}

/** Stamped by the volunteer's own submit. Staff editing the file never sets it. */
export async function markInviteCompleted(inviteId: number): Promise<void> {
	await db
		.update(volunteerInvites)
		.set({ completedAt: new Date(), updatedAt: new Date() })
		.where(eq(volunteerInvites.id, inviteId));
}
