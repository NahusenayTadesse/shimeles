import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	contactMessageReplies,
	contactMessages,
	contactSubjects,
	regions,
	statusOptions,
	user
} from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { listStatuses } from '$lib/server/workflow';
import { addContactReply } from '$lib/server/contact';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * One enquiry and its thread.
 *
 * Opening a message marks it read, which is the one side effect a `load` here
 * is allowed: the unread badge means "nobody has looked at this", and somebody
 * just did.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'submissions.read');
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(404, 'Not found');

	const [message] = await db
		.select({
			id: contactMessages.id,
			reference: contactMessages.referenceNumber,
			fullName: contactMessages.fullName,
			email: contactMessages.email,
			phone: contactMessages.phone,
			organization: contactMessages.organization,
			message: contactMessages.message,
			preferredChannel: contactMessages.preferredChannel,
			source: contactMessages.source,
			priority: contactMessages.priority,
			isRead: contactMessages.isRead,
			isSpam: contactMessages.isSpam,
			joinNewsletter: contactMessages.joinNewsletter,
			firstRespondedAt: contactMessages.firstRespondedAt,
			closedAt: contactMessages.closedAt,
			createdAt: contactMessages.createdAt,
			data: contactMessages.data,
			statusId: contactMessages.statusId,
			assignedToId: contactMessages.assignedToId,
			subjectId: contactMessages.subjectId,
			subjectOther: contactMessages.subjectOther,
			subjectName: contactSubjects.name,
			targetResponseHours: contactSubjects.targetResponseHours,
			statusLabel: statusOptions.label,
			statusColor: statusOptions.color,
			regionName: regions.name,
			assigneeName: user.name
		})
		.from(contactMessages)
		.leftJoin(contactSubjects, eq(contactSubjects.id, contactMessages.subjectId))
		.leftJoin(statusOptions, eq(statusOptions.id, contactMessages.statusId))
		.leftJoin(regions, eq(regions.id, contactMessages.regionId))
		.leftJoin(user, eq(user.id, contactMessages.assignedToId))
		.where(and(eq(contactMessages.id, id), isNull(contactMessages.deletedAt)))
		.limit(1);

	if (!message) throw error(404, 'That message does not exist.');

	const [replies, statuses, subjects, staff] = await Promise.all([
		db
			.select({
				id: contactMessageReplies.id,
				body: contactMessageReplies.body,
				isInternal: contactMessageReplies.isInternal,
				isSystem: contactMessageReplies.isSystem,
				channel: contactMessageReplies.channel,
				sentAt: contactMessageReplies.sentAt,
				createdAt: contactMessageReplies.createdAt,
				authorName: user.name
			})
			.from(contactMessageReplies)
			.leftJoin(user, eq(user.id, contactMessageReplies.authorId))
			.where(
				and(eq(contactMessageReplies.contactMessageId, id), isNull(contactMessageReplies.deletedAt))
			)
			.orderBy(asc(contactMessageReplies.createdAt), asc(contactMessageReplies.id)),

		listStatuses('contact'),

		db
			.select({ id: contactSubjects.id, name: contactSubjects.name })
			.from(contactSubjects)
			.where(isNull(contactSubjects.deletedAt))
			.orderBy(asc(contactSubjects.sortOrder)),

		db.select({ id: user.id, name: user.name }).from(user)
	]);

	// Reading an enquiry is an audited act, like reading a case (§3.11).
	audit({
		event,
		action: 'viewed',
		entityType: 'contact_message',
		entityId: id,
		metadata: { reference: message.reference }
	});

	if (!message.isRead) {
		await db
			.update(contactMessages)
			.set({ isRead: true, updatedAt: new Date() })
			.where(eq(contactMessages.id, id));
	}

	return { message, replies, statuses, subjects, staff };
};

async function guard(event: Parameters<PageServerLoad>[0]) {
	const access = await requirePermission(event, 'submissions.write');
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(404, 'Not found');

	const [exists] = await db
		.select({ id: contactMessages.id })
		.from(contactMessages)
		.where(and(eq(contactMessages.id, id), isNull(contactMessages.deletedAt)))
		.limit(1);

	if (!exists) throw error(404, 'That message does not exist.');
	return { access, id };
}

export const actions: Actions = {
	/**
	 * Adds one row to the thread. `isInternal` decides whether it is sent, and
	 * it is never inferred — a note that quietly emails the sender would be the
	 * worst bug this screen could have.
	 */
	reply: async (event) => {
		const { access, id } = await guard(event as never);
		const formData = await event.request.formData();
		const body = String(formData.get('body') ?? '').trim();
		const isInternal = String(formData.get('isInternal')) === 'true';
		const channel = String(formData.get('channel') ?? 'email');

		if (!body) return fail(400, { error: 'Write something first.' });
		if (!['email', 'phone', 'sms', 'in_person', 'note'].includes(channel)) {
			return fail(400, { error: 'Unknown channel.' });
		}

		const { emailed } = await addContactReply(event, {
			messageId: id,
			authorId: access.userId,
			body,
			isInternal,
			channel: channel as 'email' | 'phone' | 'sms' | 'in_person' | 'note'
		});

		return {
			ok: true,
			// Reported honestly: a reply that could not be sent is still saved,
			// and staff need to know which of the two happened.
			message: isInternal
				? 'Note added.'
				: emailed
					? 'Reply sent.'
					: 'Reply saved, but the email did not go out.'
		};
	},

	setStatus: async (event) => {
		const { id } = await guard(event as never);
		const formData = await event.request.formData();
		const statusId = Number(formData.get('statusId'));

		if (!Number.isFinite(statusId)) return fail(400, { error: 'Pick a status.' });

		const status = (await listStatuses('contact')).find((row) => row.id === statusId);
		if (!status) return fail(400, { error: 'That is not a message status.' });

		await db
			.update(contactMessages)
			.set({
				statusId,
				// Stamped when the message reaches a terminal stage, cleared if it
				// is reopened, so "closed" and `closedAt` cannot disagree.
				closedAt: ['closed', 'declined'].includes(status.stage) ? new Date() : null,
				updatedAt: new Date()
			})
			.where(eq(contactMessages.id, id));

		audit({
			event,
			action: 'updated_status',
			entityType: 'contact_message',
			entityId: id,
			metadata: { to: status.stage }
		});

		return { ok: true, message: 'Status updated.' };
	},

	assign: async (event) => {
		const { id } = await guard(event as never);
		const formData = await event.request.formData();
		const assignedToId = String(formData.get('assignedToId') ?? '') || null;

		await db
			.update(contactMessages)
			.set({ assignedToId, updatedAt: new Date() })
			.where(eq(contactMessages.id, id));

		audit({ event, action: 'assigned', entityType: 'contact_message', entityId: id });
		return { ok: true, message: 'Assigned.' };
	},

	/** Retagging a message that came in under the wrong topic, or none. */
	setSubject: async (event) => {
		const { id } = await guard(event as never);
		const formData = await event.request.formData();
		const raw = String(formData.get('subjectId') ?? '');
		const subjectId = raw ? Number(raw) : null;

		if (subjectId !== null && !Number.isFinite(subjectId)) {
			return fail(400, { error: 'Unknown topic.' });
		}

		await db
			.update(contactMessages)
			.set({ subjectId, subjectOther: null, updatedAt: new Date() })
			.where(eq(contactMessages.id, id));

		audit({
			event,
			action: 'updated',
			entityType: 'contact_message',
			entityId: id,
			metadata: { subjectId }
		});
		return { ok: true, message: 'Topic updated.' };
	},

	setPriority: async (event) => {
		const { id } = await guard(event as never);
		const formData = await event.request.formData();
		const priority = String(formData.get('priority') ?? '');

		if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
			return fail(400, { error: 'Unknown priority.' });
		}

		await db
			.update(contactMessages)
			.set({ priority: priority as 'low' | 'normal' | 'high' | 'urgent', updatedAt: new Date() })
			.where(eq(contactMessages.id, id));

		audit({
			event,
			action: 'updated',
			entityType: 'contact_message',
			entityId: id,
			metadata: { priority }
		});
		return { ok: true, message: 'Priority updated.' };
	}
};
