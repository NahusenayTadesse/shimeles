import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { auditLog } from '$lib/server/db/schema';

/**
 * The audit trail.
 *
 * §3.11 of the spec makes this non-negotiable: every read *and* write touching
 * `form_submissions`, `beneficiaries`, `volunteer_applications` and their
 * notes and documents leaves a row here. Medical and mental-health-adjacent
 * data is only defensible if you can say afterwards who looked at it.
 *
 * This module is the only place that inserts into `audit_log`. Nothing reads
 * back out of it except the viewer screen, which is `super_admin`-only.
 */

/** The entity families worth auditing. Free-form strings invite typos. */
export type AuditEntity =
	| 'form_submission'
	| 'form_submission_note'
	| 'form_submission_document'
	| 'beneficiary'
	| 'household'
	| 'disbursement'
	| 'volunteer_application'
	| 'volunteer_safeguarding_check'
	| 'volunteer_credential'
	| 'volunteer_reference'
	/** The skills, time slots and professions the volunteer form is built from. */
	| 'volunteer_catalog'
	| 'contact_message'
	| 'contact_message_reply'
	/** The enquiry topics and office addresses behind the contact page. */
	| 'contact_catalog'
	/** The kinds of help, need groups and languages behind the apply page. */
	| 'assistance_catalog'
	| 'newsletter_subscriber'
	| 'donation'
	| 'donor'
	| 'recurring_pledge'
	/** An offer of goods rather than money, and its line items. */
	| 'in_kind_donation'
	/** The catalogue of goods the Foundation will accept. */
	| 'in_kind_catalog'
	| 'content_block'
	| 'page'
	| 'site_setting'
	| 'form_definition'
	| 'form_field'
	| 'pillar'
	| 'about_content'
	| 'about_gallery_image'
	| 'hero_gallery_image'
	| 'homepage_gallery_image'
	| 'blog_post'
	| 'blog_category'
	| 'blog_gallery_image'
	| 'blog_video'
	| 'media_item'
	| 'testimonial'
	| 'user'
	| 'role'
	| 'file'
	| 'export'
	/** A palette lookup across cases, volunteers, donors and messages. */
	| 'search';

export type AuditAction =
	| 'viewed'
	| 'viewed_list'
	| 'created'
	| 'updated'
	| 'deleted'
	| 'restored'
	| 'updated_status'
	/**
	 * A letter went out to a beneficiary or a volunteer. Logged separately from
	 * the status change that usually prompts it, because a staff member can
	 * press "Notify applicant" at any time, more than once, and knowing that
	 * somebody was emailed — and by whom — is not recoverable from the status
	 * history alone.
	 */
	| 'notified'
	| 'assigned'
	| 'reconciled'
	| 'exported_data'
	| 'downloaded_document'
	| 'completed_check'
	| 'login'
	/**
	 * Account-recovery events, logged whether or not the address matched an
	 * account — a run of these against addresses that do not exist is what
	 * somebody probing the login form looks like, and that is only visible if
	 * the misses are recorded too.
	 */
	| 'password_reset_requested'
	| 'password_reset'
	| 'magic_link_requested'
	| 'permission_denied';

interface AuditInput {
	event: RequestEvent;
	action: AuditAction;
	entityType: AuditEntity;
	entityId?: string | number | null;
	/**
	 * Who did it, when `event.locals.user` does not know yet.
	 *
	 * Sign-in is the case: the session cookie is set by Better Auth during the
	 * action, but `locals` was populated at the start of the request and is
	 * still empty — so every `login` row was landing with a null `user_id`, on
	 * the one table whose whole purpose is saying who did what.
	 */
	userId?: string | null;
	/** Anything that helps reconstruct the action: old/new status, filters used. */
	metadata?: Record<string, unknown>;
}

/**
 * Records one audited action.
 *
 * Never throws. An audit write failing must not take down the request that
 * triggered it — a case worker being unable to open a file because the log
 * table is locked would be a worse outcome than a missing log line, and the
 * failure is loud in the server log either way.
 */
export function audit({ event, action, entityType, entityId, userId, metadata }: AuditInput): void {
	try {
		db.insert(auditLog)
			.values({
				userId: userId ?? event.locals.user?.id ?? null,
				action,
				entityType,
				entityId: entityId == null ? null : String(entityId),
				metadata: metadata ?? null,
				// `getClientAddress` throws when there is no adapter-provided address
				// (during prerender, for instance), so it is guarded with the rest.
				ipAddress: safeAddress(event),
				userAgent: event.request.headers.get('user-agent')?.slice(0, 255) ?? null,
				createdAt: new Date()
			})
			.run();
	} catch (err) {
		console.error('audit write failed', { action, entityType, entityId }, err);
	}
}

function safeAddress(event: RequestEvent): string | null {
	try {
		return event.getClientAddress();
	} catch {
		return null;
	}
}

/**
 * Convenience for the common list-view case: one row per screen load rather
 * than one per record shown, with the filters that produced the list.
 */
export const auditList = (
	event: RequestEvent,
	entityType: AuditEntity,
	metadata?: Record<string, unknown>
) => audit({ event, action: 'viewed_list', entityType, metadata });
