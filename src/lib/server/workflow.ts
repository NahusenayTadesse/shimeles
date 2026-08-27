import { error } from '@sveltejs/kit';
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
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
import { settingFlag } from '$lib/server/settings';

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
 * The switch that makes every status change notify, not just the ticked ones.
 *
 * A second, blunter control alongside `status_options.notify_applicant`: the
 * per-status flag is the considered setup, and this is the coordinator saying
 * "tell people, always". Either one turning it on is enough; neither can force
 * an email that has nothing to say (see `sendStatusEmail`).
 *
 * It lives in `site_settings` rather than in code because it is a policy the
 * Foundation changes without us (§0), and it is read per send rather than
 * cached in a module so that ticking the box takes effect on the next status
 * change rather than the next deploy.
 */
export const AUTO_NOTIFY_SETTING = 'workflow.notify_on_status_change';

export const autoNotifyEnabled = (): Promise<boolean> => settingFlag(AUTO_NOTIFY_SETTING);

/**
 * What became of an attempt to tell somebody their status changed.
 *
 * Returned rather than swallowed, because "we moved the case and emailed the
 * family" and "we moved the case and the family has no idea" are different
 * outcomes and the person who pressed the button is the one who needs to know
 * which happened.
 */
export type NotifyResult =
	| { sent: true }
	| {
			sent: false;
			reason:
				/** Neither the status nor the global switch asked for one. */
				| 'not-requested'
				/** Taken on paper or by phone — no address was ever given. */
				| 'no-email'
				/** No public description and no note: nothing to put in the letter. */
				| 'nothing-to-say'
				/** No SMTP configured on this deployment. */
				| 'no-smtp'
				| 'send-failed';
	  };

/**
 * Decides what the letter actually says. Pure, and separated out because it is
 * the one rule here worth reading on its own — and the one worth testing.
 *
 * Returns `null` when there is nothing to send, which is not a failure: it is
 * the correct outcome for an internal status nobody wrote wording for.
 */
export function statusLetter(
	publicDescription: string | null | undefined,
	note: string | null | undefined
): { body: string; note?: string } | null {
	const described = publicDescription?.trim();
	const written = note?.trim();

	// The Foundation's wording leads, with the caseworker's note after it.
	if (described) return { body: described, note: written || undefined };

	// No wording for this status: the note becomes the letter, and must not
	// then also be repeated in the panel underneath itself.
	if (written) return { body: written };

	return null;
}

/**
 * Emails whoever the record is about that their status has changed.
 *
 * **What the letter says** is the one interesting decision here. The status's
 * `public_description` is the Foundation's considered wording for "this is what
 * being Approved means", so it leads whenever there is one, with the
 * caseworker's note shown after it as a personal addition. When the status has
 * no description — most of them do not, because most are internal steps — the
 * note becomes the letter itself. That is what makes the manual button useful
 * on a status like "Verified": a caseworker writes the sentence they would have
 * said on the phone, and it goes out.
 *
 * With neither, nothing is sent. An email whose body is a status label teaches
 * the reader to ignore the next one, and inventing a sentence here would put
 * words the Foundation never wrote in front of a family.
 *
 * Never throws. A transition that succeeded must not be reported as failed
 * because the mail server is down, and by the time this runs the status change
 * is already committed and audited.
 */
async function sendStatusEmail(input: {
	kind: 'application' | 'volunteer';
	status: StatusRow;
	email: string | null;
	name: string | null;
	reference: string;
	note?: string;
}): Promise<NotifyResult> {
	// No address is not a failure: an application can be taken on paper or over
	// the phone, and a volunteer's email is nullable for the same reason.
	if (!input.email) return { sent: false, reason: 'no-email' };

	const letter = statusLetter(input.status.publicDescription, input.note);
	if (!letter) return { sent: false, reason: 'nothing-to-say' };

	try {
		const result = await sendEmail({
			to: input.email,
			...statusChangeTemplate({
				name: input.name?.trim() || 'friend',
				reference: input.reference,
				statusLabel: input.status.label,
				publicDescription: letter.body,
				note: letter.note,
				kind: input.kind
			})
		});

		if (result.sent) return { sent: true };
		return { sent: false, reason: result.reason === 'no-smtp-host' ? 'no-smtp' : 'send-failed' };
	} catch (err) {
		console.error('status change email failed', err);
		return { sent: false, reason: 'send-failed' };
	}
}

/**
 * The automatic half: sends only if the status says to, or the global switch
 * does. Pressing "Notify applicant" goes through `notifyOfCurrentStatus`
 * instead, which asks for no permission from either.
 */
async function notifyStatusChange(input: {
	kind: 'application' | 'volunteer';
	status: StatusRow;
	email: string | null;
	name: string | null;
	reference: string;
	note?: string;
}): Promise<NotifyResult> {
	const requested = input.status.notifyApplicant || (await autoNotifyEnabled());
	if (!requested) return { sent: false, reason: 'not-requested' };

	const result = await sendStatusEmail(input);

	if (!result.sent && result.reason === 'nothing-to-say' && input.status.notifyApplicant) {
		// Worth a warning: a coordinator who ticked the box is expecting mail to
		// go out, and silence is indistinguishable from a broken mail server.
		console.warn(
			`status "${input.status.label}" is set to notify but has no public description, ` +
				`so nothing was sent. Add one under Configuration → Statuses.`
		);
	}

	return result;
}

/**
 * Sends the status email for the record's *current* status, on demand.
 *
 * The "Notify applicant" button. It ignores both the per-status flag and the
 * global switch — a staff member pressing a button that says notify has said
 * everything those two settings exist to say — but it cannot conjure a letter
 * out of nothing, so a status with no public description still needs a note.
 *
 * Deliberately re-reads the record rather than taking a status from the
 * caller: the button is pressed some time after the change, possibly by
 * somebody else, and the applicant must be told where the case actually is
 * rather than where a stale page thinks it is.
 */
export async function notifyOfCurrentStatus(
	event: RequestEvent,
	access: Access,
	kind: 'application' | 'volunteer',
	recordId: number,
	note?: string
): Promise<NotifyResult> {
	const record =
		kind === 'application'
			? await db
					.select({
						pillarId: formSubmissions.pillarId,
						statusId: formSubmissions.statusId,
						reference: formSubmissions.referenceNumber,
						name: formSubmissions.submittedByName,
						email: formSubmissions.submittedByEmail
					})
					.from(formSubmissions)
					.where(eq(formSubmissions.id, recordId))
					.limit(1)
					.then((rows) => rows[0])
			: await db
					.select({
						pillarId: sql<number | null>`null`,
						statusId: volunteerApplications.statusId,
						reference: volunteerApplications.referenceNumber,
						name: volunteerApplications.fullName,
						email: volunteerApplications.email
					})
					.from(volunteerApplications)
					.where(eq(volunteerApplications.id, recordId))
					.limit(1)
					.then((rows) => rows[0]);

	if (!record) throw error(404, 'That record no longer exists.');
	if (kind === 'application') assertPillarAccess(event, access, record.pillarId);

	const status = record.statusId ? await statusById(record.statusId) : null;
	if (!status) return { sent: false, reason: 'nothing-to-say' };

	const result = await sendStatusEmail({
		kind,
		status,
		email: record.email,
		name: record.name,
		reference: record.reference,
		note
	});

	if (!result.sent) return result;

	// A letter sent to a family belongs in the case file, not only in the log.
	if (kind === 'application') {
		await db.insert(formSubmissionNotes).values({
			formSubmissionId: recordId,
			authorId: access.userId,
			note: `Notified ${record.email} that this is now "${status.label}".${note ? `\n${note}` : ''}`,
			isSystem: true,
			sentAt: new Date(),
			createdAt: new Date()
		});
	}

	audit({
		event,
		action: 'notified',
		entityType: kind === 'application' ? 'form_submission' : 'volunteer_application',
		entityId: recordId,
		metadata: { statusId: status.id, stage: status.stage, manual: true }
	});

	return result;
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
): Promise<{ status: StatusRow; notification: NotifyResult }> {
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
	const notification = await notifyStatusChange({
		kind: 'application',
		status: next,
		email: submission.applicantEmail,
		name: submission.applicantName,
		reference: submission.reference,
		note
	});

	return { status: next, notification };
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
): Promise<{ status: StatusRow; notification: NotifyResult }> {
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

	const notification = await notifyStatusChange({
		kind: 'volunteer',
		status: next,
		email: application.volunteerEmail,
		name: application.volunteerName,
		reference: application.reference,
		note
	});

	return { status: next, notification };
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
