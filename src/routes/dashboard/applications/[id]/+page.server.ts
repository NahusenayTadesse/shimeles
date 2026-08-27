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
	siteSettings,
	statusOptions,
	user
} from '$lib/server/db/schema';
import { assertPillarAccess, can, requirePermission } from '$lib/server/permissions';
import { normalizeRichText } from '$lib/richtext';
import {
	AUTO_NOTIFY_SETTING,
	autoNotifyEnabled,
	listStatuses,
	notifyOfCurrentStatus,
	setSubmissionStatus
} from '$lib/server/workflow';
import { invalidateSettings } from '$lib/server/settings';
import { addSubmissionNote } from '$lib/server/submissions';
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
		autoNotify,
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
				isInternal: formSubmissionNotes.isInternal,
				sentAt: formSubmissionNotes.sentAt,
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
			// Both tombstones, not just the file's: a document detached from the case
			// stays out of the list even when the underlying file is still on disk.
			// `getApplicationDetail` filters the join row, and the two panels
			// disagreeing about what is attached is worse than either answer.
			.where(
				and(
					eq(formSubmissionDocuments.formSubmissionId, id),
					isNull(formSubmissionDocuments.deletedAt),
					isNull(files.deletedAt)
				)
			),

		listStatuses('application'),

		// Whether the global switch is on, so the Workflow card can show the
		// checkbox in the state it is actually in rather than guessing.
		autoNotifyEnabled(),

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
		autoNotify,
		// The switch is a coordinator's decision, not a caseworker's, so the
		// checkbox is not shown to somebody who could not save it anyway.
		canManageSettings: can(access, 'settings.manage'),
		reviewers,
		beneficiary,
		disbursements: caseDisbursements,
		subject: applicationDetail.subject,
		needs: applicationDetail.needs
	};
};

/**
 * The note boxes post editor HTML now, so the length is markup as well as
 * words — 5,000 characters was a page of prose and is barely a screen of it
 * once every paragraph is wrapped. The words themselves are what `min` cares
 * about, and `normalizeRichText` has already emptied a box nobody typed in.
 */
const noteSchema = z.object({ note: z.string().trim().min(1).max(30000) });

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
		const note = normalizeRichText(String(formData.get('note') ?? ''));

		if (!Number.isFinite(statusId)) return fail(400, { error: 'Pick a status.' });

		// The transition function writes the case note and the audit row, and
		// applies the closed-at stamp — none of that is this action's business.
		const { notification } = await setSubmissionStatus(
			event,
			access,
			id,
			statusId,
			note || undefined
		);

		// Whether a letter went out is not a detail: a caseworker who thinks the
		// family has been told, and a family that has heard nothing, is the gap
		// this reporting exists to close. Silence when none was asked for — that
		// is the normal case and not worth a message.
		return {
			ok: true,
			notified: notification.sent,
			notifyReason: notification.sent ? null : notification.reason
		};
	},

	/**
	 * The "Notify applicant" button.
	 *
	 * Sends the current status to the applicant on demand, whatever the status's
	 * own flag and the global switch say — a staff member pressing a button
	 * labelled notify has already made that decision. The note box is shared
	 * with the status form above it, so a caseworker can write the sentence that
	 * should go out and press this instead of moving the case anywhere.
	 */
	notifyApplicant: async (event) => {
		const { access, id } = await guard(event as never, 'submissions.write');
		const formData = await event.request.formData();
		const note = normalizeRichText(String(formData.get('note') ?? ''));

		const result = await notifyOfCurrentStatus(event, access, 'application', id, note || undefined);

		if (result.sent) return { ok: true, notified: true };

		return fail(400, {
			error:
				result.reason === 'no-email'
					? 'This applicant gave no email address, so there is nobody to notify.'
					: result.reason === 'nothing-to-say'
						? 'This status has no public description, so there is nothing to send. Write a note above to send that instead, or add a description under Configuration → Statuses.'
						: result.reason === 'no-smtp'
							? 'No mail server is configured on this installation, so nothing could be sent.'
							: 'The email could not be sent. Nothing was delivered.'
		});
	},

	/**
	 * The global switch, toggled from where its effect is felt.
	 *
	 * Gated on `settings.manage` rather than `submissions.write`: this changes
	 * what happens on *every* case and every volunteer application, not just
	 * this one, so it is a coordinator's decision and not a caseworker's. The
	 * checkbox is hidden for anybody without it.
	 */
	setAutoNotify: async (event) => {
		await requirePermission(event, 'settings.manage');
		const formData = await event.request.formData();
		const enabled = formData.get('enabled') === 'true';

		await db
			.update(siteSettings)
			.set({ value: String(enabled), updatedAt: new Date() })
			.where(eq(siteSettings.key, AUTO_NOTIFY_SETTING));

		invalidateSettings();

		audit({
			event,
			action: 'updated',
			entityType: 'site_setting',
			metadata: { key: AUTO_NOTIFY_SETTING, value: String(enabled) }
		});

		return { ok: true, autoNotify: enabled };
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

	/**
	 * One action, two buttons.
	 *
	 * `send` is posted by the "Send reply" button and absent from the "Save
	 * note" one, so which of the two happened is carried explicitly by the form
	 * rather than guessed from whether the applicant has an email address. That
	 * guess is precisely how a caseworker's private assessment of a family
	 * would end up in that family's inbox.
	 */
	addNote: async (event) => {
		const { access, id } = await guard(event as never, 'submissions.write');
		const formData = await event.request.formData();
		const parsed = noteSchema.safeParse({
			note: normalizeRichText(String(formData.get('note') ?? ''))
		});

		if (!parsed.success) return fail(400, { error: 'Write something first.' });

		const isInternal = formData.get('send') !== 'true';

		const { emailed, reason } = await addSubmissionNote(event, access, {
			submissionId: id,
			note: parsed.data.note,
			isInternal
		});

		if (!isInternal && !emailed) {
			// Saved either way — the words are not lost — but staff must be told
			// plainly that the applicant did not receive them.
			return {
				ok: true,
				warning:
					reason === 'no-email'
						? 'Saved, but this applicant gave no email address, so nothing was sent.'
						: 'Saved, but the reply could not be emailed. It is recorded as unsent.'
			};
		}

		return { ok: true, emailed };
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
