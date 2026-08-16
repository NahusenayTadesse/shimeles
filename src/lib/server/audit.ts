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
	| 'donation'
	| 'donor'
	| 'recurring_pledge'
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
	| 'user'
	| 'role'
	| 'file'
	| 'export';

export type AuditAction =
	| 'viewed'
	| 'viewed_list'
	| 'created'
	| 'updated'
	| 'deleted'
	| 'restored'
	| 'updated_status'
	| 'assigned'
	| 'reconciled'
	| 'exported_data'
	| 'downloaded_document'
	| 'completed_check'
	| 'login'
	| 'permission_denied';

interface AuditInput {
	event: RequestEvent;
	action: AuditAction;
	entityType: AuditEntity;
	entityId?: string | number | null;
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
export function audit({ event, action, entityType, entityId, metadata }: AuditInput): void {
	try {
		db.insert(auditLog)
			.values({
				userId: event.locals.user?.id ?? null,
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
