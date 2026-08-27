import { error } from '@sveltejs/kit';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	formSubmissionNotes,
	formSubmissions,
	statusOptions,
	volunteerApplications,
	volunteerSafeguardingChecklistItems,
	volunteerSafeguardingChecks
} from '$lib/server/db/schema';
import { cached, invalidate } from '$lib/server/cache';
import { audit } from '$lib/server/audit';
import type { Access } from '$lib/server/permissions';
import { assertPillarAccess } from '$lib/server/permissions';
import { sendEmail, statusChangeTemplate } from '$lib/server/email';

/**
 * Workflow stages and the rules that gate them.
 *
 * The split the spec asks for in §3.9: `status_options.label` is editable from
 * the dashboard, `status_options.stage` is not. Every rule below keys off
 * `stage`, so renaming "Approved" to "Accepted for support" changes what staff
 * read and nothing about what the system enforces.
 */

export type ApplicationStage =
	| 'submitted'
	| 'under_review'
	| 'verified'
	| 'approved'
	| 'waitlisted'
	| 'declined'
	| 'active'
	| 'closed';

export type VolunteerStage =
	| 'submitted'
	| 'under_review'
	| 'references_checked'
	| 'credentials_verified'
	| 'approved'
	| 'declined';

/** The stages that count a case as "supported" for the impact metrics (§4). */
export const SUPPORTED_STAGES: ApplicationStage[] = ['active', 'closed'];

/** Terminal stages — a case here needs reopening before it moves again. */
export const CLOSED_STAGES: ApplicationStage[] = ['declined', 'closed'];

/**
 * Waiting on the next intake round rather than on us.
 *
 * Deliberately **not** in `CLOSED_STAGES`: a waitlisted case is still open, is
 * reassessed at each intake round, and must not have `closedAt` stamped on it.
 * The registration form promises exactly that reassessment, and a case the
 * dashboard files away as finished is a promise nobody keeps.
 */
export const WAITING_STAGES: ApplicationStage[] = ['waitlisted'];

/* ==========================================================================
   Status lookup
   ========================================================================== */

export interface StatusRow {
	id: number;
	context: 'application' | 'volunteer' | 'donation' | 'contact';
	stage: string;
	label: string;
	color: string;
	isDefault: boolean;
	sortOrder: number;
	/** Email the applicant on arriving here. Staff decide this, per row (§0). */
	notifyApplicant: boolean;
	/** What that email says. No description, no email — see `notifyApplicant`. */
	publicDescription: string | null;
}

export const listStatuses = (context: 'application' | 'volunteer' | 'donation' | 'contact') =>
	cached(`statuses:${context}`, () =>
		db
			.select({
				id: statusOptions.id,
				context: statusOptions.context,
				stage: statusOptions.stage,
				label: statusOptions.label,
				color: statusOptions.color,
				isDefault: statusOptions.isDefault,
				sortOrder: statusOptions.sortOrder,
				notifyApplicant: statusOptions.notifyApplicant,
				publicDescription: statusOptions.publicDescription
			})
			.from(statusOptions)
			.where(
				and(
					eq(statusOptions.context, context),
					eq(statusOptions.isActive, true),
					isNull(statusOptions.deletedAt)
				)
			)
			.orderBy(asc(statusOptions.sortOrder), asc(statusOptions.id))
	) as Promise<StatusRow[]>;

export const invalidateStatuses = () => invalidate('statuses');

/** The status a new record lands on. Falls back to the first by sort order. */
export async function defaultStatus(
	context: 'application' | 'volunteer' | 'donation' | 'contact'
): Promise<StatusRow | null> {
	const rows = await listStatuses(context);
	return rows.find((row) => row.isDefault) ?? rows[0] ?? null;
}

async function statusById(id: number): Promise<StatusRow | null> {
	for (const context of ['application', 'volunteer', 'donation', 'contact'] as const) {
		const found = (await listStatuses(context)).find((row) => row.id === id);
		if (found) return found;
	}
	return null;
}

/* ==========================================================================
   Telling the person about it
   ========================================================================== */

/**
 * Emails whoever the record is about, when the status they landed on says to.
 *
 * Two conditions, both of them data rather than code: the status has
 * `notify_applicant` ticked, and it has a `public_description` to say. A
 * status with the flag on and nothing to say sends nothing — an email whose
 * body is a status label teaches the reader to ignore the next one — and that
 * is worth a warning, because a coordinator who ticked the box is expecting
 * mail to go out.
 *
 * Never throws. A transition that succeeded must not be reported as failed
 * because the mail server is down, and the status change is already committed
 * and audited by the time this runs.
 */
async function notifyStatusChange(input: {
	kind: 'application' | 'volunteer';
	status: StatusRow;
	email: string | null;
	name: string | null;
	reference: string;
	note?: string;
}): Promise<void> {
	if (!input.status.notifyApplicant) return;

	if (!input.status.publicDescription?.trim()) {
		console.warn(
			`status "${input.status.label}" is set to notify but has no public description, ` +
				`so nothing was sent. Add one under Configuration → Statuses.`
		);
		return;
	}

	// No address is not a failure: an application can be taken on paper or over
	// the phone, and a volunteer's email is nullable for the same reason.
	if (!input.email) return;

	try {
		await sendEmail({
			to: input.email,
			...statusChangeTemplate({
				name: input.name?.trim() || 'friend',
				reference: input.reference,
				statusLabel: input.status.label,
				publicDescription: input.status.publicDescription,
				note: input.note,
				kind: input.kind
			})
		});
	} catch (err) {
		console.error('status change email failed', err);
	}
}

/* ==========================================================================
   Application status transitions
   ========================================================================== */

/**
 * Moves an application to a new status.
 *
 * Everything a status change implies happens here rather than at each call
 * site: the pillar-scope check, the `closedAt` stamp, the system note that
 * gives the case file a history, and the audit row.
 */
export async function setSubmissionStatus(
	event: RequestEvent,
	access: Access,
	submissionId: number,
	statusId: number,
	note?: string
): Promise<StatusRow> {
	const [submission] = await db
		.select({
			id: formSubmissions.id,
			pillarId: formSubmissions.pillarId,
			statusId: formSubmissions.statusId,
			reference: formSubmissions.referenceNumber,
			applicantName: formSubmissions.submittedByName,
			applicantEmail: formSubmissions.submittedByEmail
		})
		.from(formSubmissions)
		.where(eq(formSubmissions.id, submissionId))
		.limit(1);

	if (!submission) throw error(404, 'That application no longer exists.');
	assertPillarAccess(event, access, submission.pillarId);

	const next = await statusById(statusId);
	if (!next || next.context !== 'application') {
		throw error(400, 'That is not a valid application status.');
	}

	const previous = submission.statusId ? await statusById(submission.statusId) : null;

	await db
		.update(formSubmissions)
		.set({
			statusId: next.id,
			updatedAt: new Date(),
			closedAt: CLOSED_STAGES.includes(next.stage as ApplicationStage) ? new Date() : null
		})
		.where(eq(formSubmissions.id, submissionId));

	// A case file that cannot show when it moved and who moved it is not a case
	// file, so the system note is written unconditionally.
	await db.insert(formSubmissionNotes).values({
		formSubmissionId: submissionId,
		authorId: access.userId,
		note: `Status changed from "${previous?.label ?? 'none'}" to "${next.label}".${
			note ? `\n${note}` : ''
		}`,
		isSystem: true,
		createdAt: new Date()
	});

	audit({
		event,
		action: 'updated_status',
		entityType: 'form_submission',
		entityId: submissionId,
		metadata: { from: previous?.stage ?? null, to: next.stage, statusId: next.id }
	});

	// After the write and the audit row, so a bounced email cannot leave the
	// case looking like it never moved.
	await notifyStatusChange({
		kind: 'application',
		status: next,
		email: submission.applicantEmail,
		name: submission.applicantName,
		reference: submission.reference,
		note
	});

	return next;
}

/* ==========================================================================
   Volunteer status transitions — the safeguarding gate
   ========================================================================== */

/**
 * Recomputes `safeguarding_checklist_complete` from the checklist.
 *
 * Derived rather than set by hand, so the flag cannot drift from the checks
 * that justify it — and so adding a new checklist item from the dashboard
 * immediately makes previously-complete applications incomplete again, which
 * is the correct and deliberate behaviour for a safeguarding control.
 */
export async function recomputeSafeguarding(applicationId: number): Promise<boolean> {
	const [application] = await db
		.select({ credentials: volunteerApplications.professionalCredentials })
		.from(volunteerApplications)
		.where(eq(volunteerApplications.id, applicationId))
		.limit(1);

	if (!application) return false;

	const isProfessional = Boolean(application.credentials?.trim());

	const [items, completed] = await Promise.all([
		db
			.select({
				id: volunteerSafeguardingChecklistItems.id,
				professionalOnly: volunteerSafeguardingChecklistItems.professionalOnly
			})
			.from(volunteerSafeguardingChecklistItems)
			.where(
				and(
					eq(volunteerSafeguardingChecklistItems.isActive, true),
					isNull(volunteerSafeguardingChecklistItems.deletedAt)
				)
			),
		db
			.select({ itemId: volunteerSafeguardingChecks.checklistItemId })
			.from(volunteerSafeguardingChecks)
			.where(eq(volunteerSafeguardingChecks.volunteerApplicationId, applicationId))
	]);

	// Professional-only items do not apply to a volunteer who has not claimed
	// professional credentials — requiring them would stall every general
	// volunteer behind a check that can never be completed for them.
	const requiredIds = items
		.filter((item) => isProfessional || !item.professionalOnly)
		.map((item) => item.id);

	const completedIds = new Set(completed.map((row) => row.itemId));
	const isComplete = requiredIds.length > 0 && requiredIds.every((id) => completedIds.has(id));

	await db
		.update(volunteerApplications)
		.set({ safeguardingChecklistComplete: isComplete, updatedAt: new Date() })
		.where(eq(volunteerApplications.id, applicationId));

	return isComplete;
}

/**
 * Moves a volunteer application to a new status.
 *
 * **The safeguarding gate.** §3.6 makes this a hard rule, not a UI nicety: an
 * application cannot reach an `approved` stage while
 * `safeguarding_checklist_complete` is false. It is enforced here, in the
 * server-side transition function that every path goes through, precisely so
 * that a direct POST to the action cannot bypass it. The disabled button in
 * the UI is a courtesy; this is the control.
 */
export async function setVolunteerStatus(
	event: RequestEvent,
	access: Access,
	applicationId: number,
	statusId: number,
	note?: string
): Promise<StatusRow> {
	const [application] = await db
		.select({
			id: volunteerApplications.id,
			statusId: volunteerApplications.statusId,
			safeguardingComplete: volunteerApplications.safeguardingChecklistComplete,
			credentials: volunteerApplications.professionalCredentials,
			credentialsVerified: volunteerApplications.credentialsVerified,
			reference: volunteerApplications.referenceNumber,
			volunteerName: volunteerApplications.fullName,
			volunteerEmail: volunteerApplications.email
		})
		.from(volunteerApplications)
		.where(eq(volunteerApplications.id, applicationId))
		.limit(1);

	if (!application) throw error(404, 'That volunteer application no longer exists.');

	const next = await statusById(statusId);
	if (!next || next.context !== 'volunteer') {
		throw error(400, 'That is not a valid volunteer status.');
	}

	if (next.stage === 'approved') {
		// Recompute rather than trust the stored flag: the checklist may have
		// gained an item since it was last written.
		const complete = await recomputeSafeguarding(applicationId);
		if (!complete) {
			audit({
				event,
				action: 'permission_denied',
				entityType: 'volunteer_application',
				entityId: applicationId,
				metadata: { reason: 'safeguarding_incomplete', attemptedStatusId: statusId }
			});

			// An empty checklist is `incomplete` too, and deliberately so — but
			// "complete every check" is unfollowable advice when there are no
			// checks to complete, which is the state of a fresh installation.
			// Name the actual problem instead of sending a coordinator looking for
			// a list that does not exist.
			const [{ total }] = await db
				.select({ total: count() })
				.from(volunteerSafeguardingChecklistItems)
				.where(
					and(
						eq(volunteerSafeguardingChecklistItems.isActive, true),
						isNull(volunteerSafeguardingChecklistItems.deletedAt)
					)
				);

			throw error(
				422,
				total === 0
					? 'No safeguarding checks have been set up yet, and a volunteer cannot be approved without them. Add them under Configuration → Safeguarding checklist.'
					: 'This volunteer cannot be approved until every safeguarding check is complete.'
			);
		}

		// A volunteer claiming professional credentials must have had them
		// verified before they can be placed with a beneficiary.
		if (application.credentials?.trim() && application.credentialsVerified !== true) {
			throw error(
				422,
				'This volunteer lists professional credentials, which must be verified before approval.'
			);
		}
	}

	const previous = application.statusId ? await statusById(application.statusId) : null;

	await db
		.update(volunteerApplications)
		.set({ statusId: next.id, updatedAt: new Date() })
		.where(eq(volunteerApplications.id, applicationId));

	audit({
		event,
		action: 'updated_status',
		entityType: 'volunteer_application',
		entityId: applicationId,
		metadata: { from: previous?.stage ?? null, to: next.stage, note: note ?? null }
	});

	await notifyStatusChange({
		kind: 'volunteer',
		status: next,
		email: application.volunteerEmail,
		name: application.volunteerName,
		reference: application.reference,
		note
	});

	return next;
}

/**
 * Whether the approve action should be offered at all. The UI calls this to
 * disable the control; `setVolunteerStatus` re-checks regardless.
 */
export const canApproveVolunteer = (application: {
	safeguardingChecklistComplete: boolean;
	professionalCredentials: string | null;
	credentialsVerified: boolean | null;
}) =>
	application.safeguardingChecklistComplete &&
	(!application.professionalCredentials?.trim() || application.credentialsVerified === true);
