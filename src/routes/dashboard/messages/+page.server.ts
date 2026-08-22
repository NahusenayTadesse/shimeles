import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { contactMessages, contactSubjects, statusOptions, user } from '$lib/server/db/schema';
import { searchFilter } from '$lib/server/query';
import { requirePermission } from '$lib/server/permissions';
import { listStatuses } from '$lib/server/workflow';
import { audit, auditList } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * The message queue.
 *
 * Messages live in `contact_messages` rather than `form_submissions` — see the
 * note at the top of §3.7 in the schema. What that buys this screen is the
 * three things a coordinator actually wants from it: which topic a message is
 * about, whose queue it is in, and whether anybody has answered it.
 *
 * Not pillar-scoped, because a general enquiry is not case data. The
 * permission is the whole gate, as it was before.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'submissions.read');

	const params = event.url.searchParams;
	const search = params.get('q')?.trim() ?? '';
	const statusId = params.get('status');
	const subjectId = params.get('subject');
	const unread = params.get('unread') === '1';
	const unanswered = params.get('unanswered') === '1';
	const mine = params.get('mine') === '1';
	const spam = params.get('spam') === '1';

	const clauses: (SQL | undefined)[] = [
		isNull(contactMessages.deletedAt),
		// Spam is hidden rather than deleted, and only shown when asked for.
		eq(contactMessages.isSpam, spam)
	];

	if (statusId) clauses.push(eq(contactMessages.statusId, Number(statusId)));
	if (subjectId) clauses.push(eq(contactMessages.subjectId, Number(subjectId)));
	if (unread) clauses.push(eq(contactMessages.isRead, false));
	// "Nobody has replied yet" is the real working queue.
	if (unanswered) clauses.push(isNull(contactMessages.firstRespondedAt));
	if (mine && event.locals.user) {
		clauses.push(eq(contactMessages.assignedToId, event.locals.user.id));
	}

	const searchClause = searchFilter(search, [
		contactMessages.referenceNumber,
		contactMessages.fullName,
		contactMessages.email,
		contactMessages.phone,
		contactMessages.organization,
		contactMessages.message
	]);
	if (searchClause) clauses.push(searchClause);

	const [rows, statuses, subjects] = await Promise.all([
		db
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
				firstRespondedAt: contactMessages.firstRespondedAt,
				createdAt: contactMessages.createdAt,
				subjectName: contactSubjects.name,
				subjectIcon: contactSubjects.icon,
				/** Null means the topic makes no promise; nothing is overdue against it. */
				targetResponseHours: contactSubjects.targetResponseHours,
				statusLabel: statusOptions.label,
				statusColor: statusOptions.color,
				statusStage: statusOptions.stage,
				assigneeName: user.name,
				replyCount: sql<number>`(
					select count(*) from contact_message_replies r
					where r.contact_message_id = ${contactMessages.id} and r.is_internal = 0
				)`
			})
			.from(contactMessages)
			.leftJoin(contactSubjects, eq(contactSubjects.id, contactMessages.subjectId))
			.leftJoin(statusOptions, eq(statusOptions.id, contactMessages.statusId))
			.leftJoin(user, eq(user.id, contactMessages.assignedToId))
			.where(and(...(clauses.filter(Boolean) as SQL[])))
			// Unread first, then newest — the queue reads top-down.
			.orderBy(asc(contactMessages.isRead), desc(contactMessages.createdAt))
			.limit(300),

		listStatuses('contact'),

		db
			.select({ id: contactSubjects.id, name: contactSubjects.name })
			.from(contactSubjects)
			.where(isNull(contactSubjects.deletedAt))
			.orderBy(asc(contactSubjects.sortOrder), asc(contactSubjects.id))
	]);

	auditList(event, 'contact_message', {
		search,
		statusId,
		subjectId,
		unread,
		unanswered,
		mine,
		spam,
		results: rows.length
	});

	return {
		rows,
		statuses,
		subjects,
		filters: { search, statusId, subjectId, unread, unanswered, mine, spam }
	};
};

/** Every action here re-scopes to a live message, so an id alone reaches nothing else. */
async function target(event: Parameters<PageServerLoad>[0]) {
	const access = await requirePermission(event, 'submissions.write');
	const formData = await event.request.formData();
	const id = Number(formData.get('id'));
	return { access, id, formData };
}

export const actions: Actions = {
	markRead: async (event) => {
		const { id, formData } = await target(event as never);
		const read = String(formData.get('read')) !== 'false';

		if (!Number.isFinite(id)) return fail(400, { error: 'Unknown message.' });

		await db
			.update(contactMessages)
			.set({ isRead: read, updatedAt: new Date() })
			.where(eq(contactMessages.id, id));

		audit({
			event,
			action: 'updated',
			entityType: 'contact_message',
			entityId: id,
			metadata: { isRead: read }
		});
		return { ok: true };
	},

	/** Reversible, and reversible from the list — hence the spam filter above. */
	markSpam: async (event) => {
		const { id, formData } = await target(event as never);
		const spam = String(formData.get('spam')) !== 'false';

		if (!Number.isFinite(id)) return fail(400, { error: 'Unknown message.' });

		await db
			.update(contactMessages)
			.set({ isSpam: spam, updatedAt: new Date() })
			.where(eq(contactMessages.id, id));

		audit({
			event,
			action: 'updated',
			entityType: 'contact_message',
			entityId: id,
			metadata: { isSpam: spam }
		});
		return { ok: true };
	},

	archive: async (event) => {
		const { id } = await target(event as never);

		if (!Number.isFinite(id)) return fail(400, { error: 'Unknown message.' });

		// Soft delete — a message someone archived by mistake is recoverable.
		await db
			.update(contactMessages)
			.set({ deletedAt: new Date() })
			.where(eq(contactMessages.id, id));

		audit({ event, action: 'deleted', entityType: 'contact_message', entityId: id });
		return { ok: true };
	}
};
