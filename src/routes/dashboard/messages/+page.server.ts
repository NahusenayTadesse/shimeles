import { fail } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { formDefinitions, formSubmissions, statusOptions } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { audit, auditList } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * Contact-form messages.
 *
 * §3.7 allows the contact form either to ride on `form_submissions` or to have
 * its own table, and asks only for consistency. It rides on `form_submissions`
 * here — building a second bespoke table when the dynamic form system already
 * covers it would be exactly the duplication the spec warns against.
 *
 * What separates a message from a case is that it has no pillar, so it is not
 * pillar-scoped: a general enquiry is not case data.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'submissions.read');

	const rows = await db
		.select({
			id: formSubmissions.id,
			reference: formSubmissions.referenceNumber,
			name: formSubmissions.submittedByName,
			email: formSubmissions.submittedByEmail,
			phone: formSubmissions.submittedByPhone,
			data: formSubmissions.data,
			isRead: formSubmissions.isRead,
			createdAt: formSubmissions.createdAt,
			language: formSubmissions.language,
			formName: formDefinitions.name,
			statusLabel: statusOptions.label,
			statusColor: statusOptions.color,
			statusId: formSubmissions.statusId
		})
		.from(formSubmissions)
		.innerJoin(formDefinitions, eq(formDefinitions.id, formSubmissions.formDefinitionId))
		.leftJoin(statusOptions, eq(statusOptions.id, formSubmissions.statusId))
		.where(and(isNull(formSubmissions.pillarId), isNull(formSubmissions.deletedAt)))
		.orderBy(desc(formSubmissions.createdAt))
		.limit(300);

	auditList(event, 'form_submission', { view: 'messages', results: rows.length });

	return { rows };
};

export const actions: Actions = {
	markRead: async (event) => {
		await requirePermission(event, 'submissions.write');
		const formData = await event.request.formData();
		const id = Number(formData.get('id'));
		const read = String(formData.get('read')) !== 'false';

		if (!Number.isFinite(id)) return fail(400, { error: 'Unknown message.' });

		// Scoped to pillar-less rows so this action cannot be pointed at a case,
		// which has its own screen and its own permission checks.
		await db
			.update(formSubmissions)
			.set({ isRead: read, updatedAt: new Date() })
			.where(and(eq(formSubmissions.id, id), isNull(formSubmissions.pillarId)));

		audit({
			event,
			action: 'updated',
			entityType: 'form_submission',
			entityId: id,
			metadata: { isRead: read }
		});
		return { ok: true };
	},

	archive: async (event) => {
		const access = await requirePermission(event, 'submissions.write');
		const formData = await event.request.formData();
		const id = Number(formData.get('id'));

		if (!Number.isFinite(id)) return fail(400, { error: 'Unknown message.' });

		// Soft delete — a message someone archived by mistake is recoverable.
		await db
			.update(formSubmissions)
			.set({ deletedAt: new Date() })
			.where(and(eq(formSubmissions.id, id), isNull(formSubmissions.pillarId)));

		void access;
		audit({ event, action: 'deleted', entityType: 'form_submission', entityId: id });
		return { ok: true };
	}
};
