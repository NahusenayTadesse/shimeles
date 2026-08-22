import { and, asc, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	contactMessageReplies,
	contactMessages,
	contactOffices,
	contactSubjects,
	newsletterSubscribers,
	pillars,
	regions
} from '$lib/server/db/schema';
import { nextContactReference, withReference } from '$lib/server/reference';
import { defaultStatus } from '$lib/server/workflow';
import { sendEmail } from '$lib/server/email';
import { setting } from '$lib/server/settings';
import { audit } from '$lib/server/audit';
import { cached } from '$lib/server/cache';

/**
 * Contact messages — the enquiry topics the form offers, and the write behind
 * `/contact`.
 *
 * §3.7 leaves it open whether the contact form rides on `form_submissions` or
 * gets its own table. It has its own table because of what staff do with a
 * message rather than what a sender puts in it: an enquiry gets *routed* and
 * *answered*, and neither has anywhere to live on a submission row. A case's
 * history is internal case notes that are never sent to anyone; a message's
 * history is a thread of replies that mostly were.
 *
 * As with `/volunteer`, the questions are code and the vocabulary is data: the
 * topics in `contact_subjects` and the addresses in `contact_offices` are rows
 * a staff member edits, and each topic carries its own routing so "press
 * enquiries now go to the comms lead" is an edit, not a deploy (§0).
 */

/* ==========================================================================
   Catalogues
   ========================================================================== */

export type SubjectOption = {
	id: number;
	slug: string;
	name: string;
	description: string | null;
	icon: string | null;
	publicResponseNote: string | null;
	/** Set when this topic is really an application; the form says so. */
	suggestedPillarSlug: string | null;
	suggestedPillarName: string | null;
};

export type OfficeOption = {
	id: number;
	name: string;
	addressLine: string | null;
	city: string | null;
	phone: string | null;
	email: string | null;
	openingHours: string | null;
	mapUrl: string | null;
	isPrimary: boolean;
	regionName: string | null;
};

export async function getContactSubjects(): Promise<SubjectOption[]> {
	return cached('contact:subjects', async () =>
		db
			.select({
				id: contactSubjects.id,
				slug: contactSubjects.slug,
				name: contactSubjects.name,
				description: contactSubjects.description,
				icon: contactSubjects.icon,
				publicResponseNote: contactSubjects.publicResponseNote,
				suggestedPillarSlug: pillars.slug,
				suggestedPillarName: pillars.name
			})
			.from(contactSubjects)
			.leftJoin(pillars, eq(pillars.id, contactSubjects.suggestedPillarId))
			.where(and(eq(contactSubjects.isActive, true), isNull(contactSubjects.deletedAt)))
			.orderBy(asc(contactSubjects.sortOrder), asc(contactSubjects.id))
	);
}

export async function getContactOffices(): Promise<OfficeOption[]> {
	return cached('contact:offices', async () =>
		db
			.select({
				id: contactOffices.id,
				name: contactOffices.name,
				addressLine: contactOffices.addressLine,
				city: contactOffices.city,
				phone: contactOffices.phone,
				email: contactOffices.email,
				openingHours: contactOffices.openingHours,
				mapUrl: contactOffices.mapUrl,
				isPrimary: contactOffices.isPrimary,
				regionName: regions.name
			})
			.from(contactOffices)
			.leftJoin(regions, eq(regions.id, contactOffices.regionId))
			.where(and(eq(contactOffices.isActive, true), isNull(contactOffices.deletedAt)))
			.orderBy(asc(contactOffices.sortOrder), asc(contactOffices.id))
	);
}

/** Everything `/contact` needs to render, in one call. */
export async function getContactCatalog() {
	const [subjects, offices] = await Promise.all([getContactSubjects(), getContactOffices()]);
	return { subjects, offices };
}

/* ==========================================================================
   The public submission
   ========================================================================== */

export type ContactSubmission = {
	subjectId: number | null;
	fullName: string;
	email: string | null;
	phone: string | null;
	organization: string | null;
	message: string;
	preferredChannel: 'email' | 'phone' | 'either';
	joinNewsletter: boolean;
};

export type ContactResult = { id: number; referenceNumber: string };

/**
 * Stores one enquiry and routes it.
 *
 * The subject id is re-read against the live catalogue before it is stored,
 * for the same reason every other public write here does it: the form only
 * ever offers active rows, so anything else is a stale tab or someone poking
 * at the endpoint, and neither should create a dangling reference.
 *
 * The topic's `defaultAssigneeId` is applied here rather than by a later
 * triage step, so a message is in somebody's queue from the moment it lands.
 */
export async function createContactMessage(
	event: RequestEvent,
	input: ContactSubmission
): Promise<ContactResult> {
	const [subject] = input.subjectId
		? await db
				.select({
					id: contactSubjects.id,
					name: contactSubjects.name,
					notifyEmails: contactSubjects.notifyEmails,
					defaultAssigneeId: contactSubjects.defaultAssigneeId
				})
				.from(contactSubjects)
				.where(
					and(
						eq(contactSubjects.id, input.subjectId),
						eq(contactSubjects.isActive, true),
						isNull(contactSubjects.deletedAt)
					)
				)
				.limit(1)
		: [];

	const [status, defaultRegion] = await Promise.all([
		defaultStatus('contact'),
		db
			.select({ id: regions.id })
			.from(regions)
			.where(and(eq(regions.isDefault, true), isNull(regions.deletedAt)))
			.limit(1)
	]);

	const email = input.email?.trim().toLowerCase() || null;

	// Reference and row commit together — see `withReference`.
	const { id: messageId, referenceNumber } = withReference(() => {
		const referenceNumber = nextContactReference();

		const [created] = db
			.insert(contactMessages)
			.values({
				referenceNumber,
				subjectId: subject?.id ?? null,
				fullName: input.fullName,
				email,
				phone: input.phone,
				organization: input.organization,
				message: input.message,
				preferredChannel: input.preferredChannel,
				regionId: defaultRegion[0]?.id ?? null,
				source: 'web_form',
				statusId: status?.id ?? null,
				assignedToId: subject?.defaultAssigneeId ?? null,
				joinNewsletter: input.joinNewsletter,
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning({ id: contactMessages.id })
			.all();

		return { id: created.id, referenceNumber };
	});

	// Opt-in only, and only when there is an address to subscribe. A sender who
	// did not tick the box has not joined anything by writing to us.
	if (input.joinNewsletter && email) {
		await db
			.insert(newsletterSubscribers)
			.values({
				email,
				name: input.fullName,
				source: 'contact_form',
				subscribedAt: new Date(),
				unsubscribeToken: randomUUID(),
				createdAt: new Date()
			})
			.onConflictDoNothing();
	}

	audit({
		event,
		action: 'created',
		entityType: 'contact_message',
		entityId: messageId,
		metadata: { reference: referenceNumber, subject: subject?.name ?? null }
	});

	return { id: messageId, referenceNumber };
}

/**
 * Tells whoever owns this topic that a message arrived.
 *
 * Recipients come from the subject row, falling back to `contact.email_primary`
 * — a topic with nobody on it is still answered by somebody. As with every
 * other notification here the mail carries the reference and a link, never the
 * message body: reading it in the dashboard is an audited act (§3.11).
 */
export async function notifyNewContactMessage(
	result: ContactResult,
	subjectId: number | null
): Promise<void> {
	const [subject] = subjectId
		? await db
				.select({ name: contactSubjects.name, notifyEmails: contactSubjects.notifyEmails })
				.from(contactSubjects)
				.where(eq(contactSubjects.id, subjectId))
				.limit(1)
		: [];

	const fallback = await setting('contact.email_primary');
	const recipients = subject?.notifyEmails?.length
		? subject.notifyEmails
		: fallback
			? [fallback]
			: [];

	if (recipients.length === 0) return;

	const origin = await setting('site.url');
	const subjectLine = `New enquiry${subject?.name ? `, ${subject.name}` : ''}: ${result.referenceNumber}`;
	const body = [
		'A new message has arrived through the contact form.',
		'',
		`Reference: ${result.referenceNumber}`,
		subject?.name ? `Topic: ${subject.name}` : '',
		'',
		origin ? `Read and reply here: ${origin}/dashboard/messages/${result.id}` : ''
	]
		.filter(Boolean)
		.join('\n');

	await Promise.all(recipients.map((to) => sendEmail(to, subjectLine, escapeHtml(body))));
}

/* ==========================================================================
   Replying
   ========================================================================== */

/**
 * Adds one row to a message's thread, and sends it if it is a reply rather
 * than an internal note.
 *
 * `isInternal` decides everything: an internal note is never emailed and never
 * stamps `first_responded_at`, because thinking out loud about an enquiry is
 * not answering it. The send happens before the timestamp is written, so a
 * bounced reply does not leave the message looking answered.
 */
export async function addContactReply(
	event: RequestEvent,
	input: {
		messageId: number;
		authorId: string | null;
		body: string;
		isInternal: boolean;
		channel: 'email' | 'phone' | 'sms' | 'in_person' | 'note';
	}
): Promise<{ emailed: boolean }> {
	const [message] = await db
		.select({
			id: contactMessages.id,
			email: contactMessages.email,
			fullName: contactMessages.fullName,
			reference: contactMessages.referenceNumber,
			firstRespondedAt: contactMessages.firstRespondedAt
		})
		.from(contactMessages)
		.where(eq(contactMessages.id, input.messageId))
		.limit(1);

	if (!message) return { emailed: false };

	// Only an email-channel reply to someone who gave us an address actually
	// goes anywhere. A phone call logged here is a record of a conversation
	// that already happened, not something to send.
	const shouldEmail = !input.isInternal && input.channel === 'email' && Boolean(message.email);
	let emailed = false;

	if (shouldEmail) {
		try {
			await sendEmail(
				message.email!,
				`Re: your message to the Shimeles Abera Foundation (${message.reference})`,
				replyTemplate(message.fullName, input.body, message.reference)
			);
			emailed = true;
		} catch (err) {
			// Recorded as an unsent reply rather than lost: staff need to see that
			// they wrote it and that it did not go.
			console.error('contact reply email failed', err);
		}
	}

	await db.insert(contactMessageReplies).values({
		contactMessageId: input.messageId,
		authorId: input.authorId,
		body: input.body,
		isInternal: input.isInternal,
		channel: input.channel,
		sentAt: emailed ? new Date() : null
	});

	// Stamped once and never moved: "how long did we take" is measured against
	// the first reply, not the most recent one.
	//
	// A reply that was meant to be emailed and could not be sent does not count.
	// It is on file, and staff can see they wrote it, but the sender has not
	// heard from us — marking the message answered would drop it out of the
	// awaiting-reply queue and quietly flatter the response-time figure with a
	// reply nobody received. A logged phone call or an in-person conversation
	// still stamps: nothing was supposed to be sent, so nothing failed.
	if (!input.isInternal && !message.firstRespondedAt && (emailed || !shouldEmail)) {
		await db
			.update(contactMessages)
			.set({ firstRespondedAt: new Date(), updatedAt: new Date() })
			.where(eq(contactMessages.id, input.messageId));
	}

	audit({
		event,
		action: 'created',
		entityType: 'contact_message_reply',
		entityId: input.messageId,
		metadata: { internal: input.isInternal, channel: input.channel, emailed }
	});

	return { emailed };
}

/** Plain-text bodies still go out as HTML, so the newlines need help. */
const escapeHtml = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />');

const replyTemplate = (name: string, body: string, reference: string) =>
	`<p>Dear ${escapeHtml(name)},</p>
	 <p>${escapeHtml(body)}</p>
	 <p style="color:#666;font-size:12px">Your reference is ${reference}. You can reply to this email and it will reach us.</p>`;
