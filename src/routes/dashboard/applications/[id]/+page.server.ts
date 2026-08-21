import { error, fail } from '@sveltejs/kit';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db } from '$lib/server/db';
import {
	applicationSubjects,
	beneficiaries,
	disbursements,
	files,
	formDefinitions,
	formFields,
	formSubmissionDocuments,
	formSubmissionNotes,
	formSubmissions,
	pillars,
	regions,
	statusOptions,
	user
} from '$lib/server/db/schema';
import { assertPillarAccess, requirePermission } from '$lib/server/permissions';
import { listStatuses, setSubmissionStatus } from '$lib/server/workflow';
import { linkBeneficiary } from '$lib/server/submissions';
import { acceptApplication, getApplicationDetail } from '$lib/server/apply';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * One case file.
 *
 * Two rules govern this route, and both are enforced server-side before a byte
 * of case data is returned:
 *
 *  - **Pillar scope (§3.10).** A caseworker assigned to Mental Wellness gets a
 *    403 on a Medical Hardship case, whether they clicked a link or typed the
 *    id. `assertPillarAccess` is the gate, and it runs in the load *and* in
 *    every action.
 *  - **Audit (§3.11).** Opening this page writes a `viewed_case` row. Reading a
 *    medical or mental-health record is the event the log exists to capture, so
 *    it is recorded on the read, not only on the write.
 */
export const load: PageServerLoad = async (event) => {
	const access = await requirePermission(event, 'submissions.read');
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(404, 'Not found');

	const [submission] = await db
		.select({
			id: formSubmissions.id,
			reference: formSubmissions.referenceNumber,
			data: formSubmissions.data,
			statusId: formSubmissions.statusId,
			pillarId: formSubmissions.pillarId,
			beneficiaryId: formSubmissions.submittedByBeneficiaryId,
			name: formSubmissions.submittedByName,
			phone: formSubmissions.submittedByPhone,
			email: formSubmissions.submittedByEmail,
			reviewerId: formSubmissions.assignedReviewerId,
			regionId: formSubmissions.regionId,
			language: formSubmissions.language,
			priority: formSubmissions.priority,
			isRead: formSubmissions.isRead,
			createdAt: formSubmissions.createdAt,
			closedAt: formSubmissions.closedAt,
			formId: formDefinitions.id,
			formName: formDefinitions.name,
			formSlug: formDefinitions.slug,
			isLowBarrier: formDefinitions.isLowBarrier,
			pillarName: pillars.name,
			pillarColor: pillars.color,
			statusLabel: statusOptions.label,
			statusColor: statusOptions.color,
			statusStage: statusOptions.stage,
			regionName: regions.name,
			reviewerName: user.name
		})
		.from(formSubmissions)
		.innerJoin(formDefinitions, eq(formDefinitions.id, formSubmissions.formDefinitionId))
		.leftJoin(pillars, eq(pillars.id, formSubmissions.pillarId))
		.leftJoin(statusOptions, eq(statusOptions.id, formSubmissions.statusId))
		.leftJoin(regions, eq(regions.id, formSubmissions.regionId))
		.leftJoin(user, eq(user.id, formSubmissions.assignedReviewerId))
		.where(and(eq(formSubmissions.id, id), isNull(formSubmissions.deletedAt)))
		.limit(1);

	if (!submission) throw error(404, 'That application does not exist.');
	assertPillarAccess(event, access, submission.pillarId);

	const [
		fields,
		notes,
		documents,
		statuses,
		reviewers,
		beneficiary,
		caseDisbursements,
		applicationDetail
	] = await Promise.all([
		// The questions as they were defined, so an answer is shown with its
		// label rather than as a raw JSON key.
		db
			.select({
				fieldKey: formFields.fieldKey,
				label: formFields.label,
				fieldType: formFields.fieldType,
				options: formFields.options,
				sortOrder: formFields.sortOrder
			})
			.from(formFields)
			.where(eq(formFields.formDefinitionId, submission.formId))
			.orderBy(asc(formFields.sortOrder)),

		db
			.select({
				id: formSubmissionNotes.id,
				note: formSubmissionNotes.note,
				isSystem: formSubmissionNotes.isSystem,
				createdAt: formSubmissionNotes.createdAt,
				authorName: user.name
			})
			.from(formSubmissionNotes)
			.leftJoin(user, eq(user.id, formSubmissionNotes.authorId))
			.where(
				and(eq(formSubmissionNotes.formSubmissionId, id), isNull(formSubmissionNotes.deletedAt))
			)
			.orderBy(desc(formSubmissionNotes.createdAt)),

		db
			.select({
				id: formSubmissionDocuments.id,
				label: formSubmissionDocuments.label,
				fileId: files.id,
				storagePath: files.storagePath,
				originalFilename: files.originalFilename,
				mimeType: files.mimeType,
				sizeBytes: files.sizeBytes
			})
			.from(formSubmissionDocuments)
			.innerJoin(files, eq(files.id, formSubmissionDocuments.fileId))
			.where(and(eq(formSubmissionDocuments.formSubmissionId, id), isNull(files.deletedAt))),

		listStatuses('application'),

		db.select({ id: user.id, name: user.name }).from(user),

		submission.beneficiaryId
			? db
					.select()
					.from(beneficiaries)
					.where(eq(beneficiaries.id, submission.beneficiaryId))
					.limit(1)
					.then((rows) => rows[0] ?? null)
			: Promise.resolve(null),

		db
			.select({
				id: disbursements.id,
				amount: disbursements.amount,
				currency: disbursements.currency,
				paidTo: disbursements.paidTo,
				date: disbursements.disbursementDate,
				fundSource: disbursements.fundSource
			})
			.from(disbursements)
			.where(and(eq(disbursements.formSubmissionId, id), isNull(disbursements.deletedAt)))
			.orderBy(desc(disbursements.disbursementDate)),

		// The structured half of an application taken through `/apply`: who is
		// actually being helped, what they asked for, what they attached.
		// Empty for cases taken through the form builder, which is exactly how
		// it should read on screen.
		getApplicationDetail(id)
	]);

	// Reading a case is the audited event, not just editing one.
	audit({
		event,
		action: 'viewed',
		entityType: 'form_submission',
		entityId: id,
		metadata: { reference: submission.reference, documents: documents.length }
	});

	// Opening a case marks it read. Harmless, and it is what makes the unread
	// badge in the sidebar mean anything.
	if (!submission.isRead) {
		await db.update(formSubmissions).set({ isRead: true }).where(eq(formSubmissions.id, id));
	}

	return {
		submission,
		fields,
		notes,
		documents,
		statuses,
		reviewers,
		beneficiary,
		disbursements: caseDisbursements,
		subject: applicationDetail.subject,
		needs: applicationDetail.needs
	};
};

const noteSchema = z.object({ note: z.string().trim().min(1).max(5000) });

/** Every action re-checks the pillar scope; none of them trust the page load. */
async function guard(event: Parameters<PageServerLoad>[0], permission: 'submissions.write') {
	const access = await requirePermission(event, permission);
	const id = Number(event.params.id);

	const [row] = await db
		.select({ pillarId: formSubmissions.pillarId })
		.from(formSubmissions)
		.where(eq(formSubmissions.id, id))
		.limit(1);

	if (!row) throw error(404, 'That application does not exist.');
	assertPillarAccess(event, access, row.pillarId);

	return { access, id };
}

export const actions: Actions = {
	setStatus: async (event) => {
		const { access, id } = await guard(event as never, 'submissions.write');
		const formData = await event.request.formData();
		const statusId = Number(formData.get('statusId'));
		const note = String(formData.get('note') ?? '').trim();

		if (!Number.isFinite(statusId)) return fail(400, { error: 'Pick a status.' });

		// The transition function writes the case note and the audit row, and
		// applies the closed-at stamp — none of that is this action's business.
		await setSubmissionStatus(event, access, id, statusId, note || undefined);
		return { ok: true };
	},

	assign: async (event) => {
		const { access, id } = await guard(event as never, 'submissions.write');
		const formData = await event.request.formData();
		const reviewerId = String(formData.get('reviewerId') ?? '') || null;

		await db
			.update(formSubmissions)
			.set({ assignedReviewerId: reviewerId, updatedAt: new Date() })
			.where(eq(formSubmissions.id, id));

		audit({
			event,
			action: 'assigned',
			entityType: 'form_submission',
			entityId: id,
			metadata: { reviewerId }
		});

		void access;
		return { ok: true };
	},

	setPriority: async (event) => {
		const { id } = await guard(event as never, 'submissions.write');
		const formData = await event.request.formData();
		const priority = String(formData.get('priority') ?? 'normal');

		if (!['low', 'normal', 'high', 'urgent', 'deferred'].includes(priority)) {
			return fail(400, { error: 'Unknown priority.' });
		}

		await db
			.update(formSubmissions)
			.set({ priority: priority as never, updatedAt: new Date() })
			.where(eq(formSubmissions.id, id));

		audit({
			event,
			action: 'updated',
			entityType: 'form_submission',
			entityId: id,
			metadata: { priority }
		});

		return { ok: true };
	},

	addNote: async (event) => {
		const { access, id } = await guard(event as never, 'submissions.write');
		const formData = await event.request.formData();
		const parsed = noteSchema.safeParse({ note: formData.get('note') });

		if (!parsed.success) return fail(400, { error: 'Write something first.' });

		await db.insert(formSubmissionNotes).values({
			formSubmissionId: id,
			authorId: access.userId,
			note: parsed.data.note,
			isSystem: false,
			createdAt: new Date()
		});

		audit({ event, action: 'created', entityType: 'form_submission_note', entityId: id });
		return { ok: true };
	},

	/**
	 * Links this case to a beneficiary record, creating one if this is a new
	 * person. The continuity-of-care step from §3.4 — a caseworker presses this
	 * once and the family is recognised the next time they apply.
	 *
	 * Two implementations, and which one runs depends on how the application
	 * arrived. `acceptApplication` keys on `application_subjects`, so a case
	 * where a daughter applied for her mother creates a record for the
	 * *mother*. The older `linkBeneficiary` keys on `submitted_by_*`, which is
	 * only correct when someone applied for themselves — it stays for cases
	 * taken through the form builder, which have no subject row to read.
	 */
	linkBeneficiary: async (event) => {
		const { access, id } = await guard(event as never, 'submissions.write');

		const [subject] = await db
			.select({ id: applicationSubjects.id })
			.from(applicationSubjects)
			.where(eq(applicationSubjects.formSubmissionId, id))
			.limit(1);

		if (subject) {
			const { beneficiaryId, created } = await acceptApplication(event, id, access.userId);
			return {
				ok: true,
				beneficiaryId,
				message: created
					? 'Beneficiary record created and linked.'
					: 'Linked to the existing beneficiary record.'
			};
		}

		const beneficiaryId = await linkBeneficiary(event, id, access.userId);
		return { ok: true, beneficiaryId, message: 'Linked to a beneficiary record.' };
	}
};
