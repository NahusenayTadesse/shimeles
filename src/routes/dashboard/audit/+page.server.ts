import { and, desc, eq, gte, like, or, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { auditLog, user } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import type { PageServerLoad } from './$types';

/**
 * The audit log viewer.
 *
 * Read-only and `super_admin`-only, per §5.11. Deliberately not exportable and
 * deliberately not deletable from the interface: a log a user can edit is not
 * a log. Retention, if it is ever needed, belongs in a maintenance job with its
 * own review, not behind a button here.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'audit.read');

	const search = event.url.searchParams.get('q')?.trim() ?? '';
	const action = event.url.searchParams.get('action') ?? '';
	const entityType = event.url.searchParams.get('entity') ?? '';
	const days = Number(event.url.searchParams.get('days') ?? 30);
	const page = Math.max(1, Number(event.url.searchParams.get('page') ?? 1));
	const perPage = 100;

	const since = new Date(Date.now() - (Number.isFinite(days) ? days : 30) * 86400_000);

	const clauses: (SQL | undefined)[] = [gte(auditLog.createdAt, since)];
	if (action) clauses.push(eq(auditLog.action, action));
	if (entityType) clauses.push(eq(auditLog.entityType, entityType));
	if (search) {
		const needle = `%${search}%`;
		clauses.push(or(like(user.name, needle), like(auditLog.entityId, needle)));
	}

	const rows = await db
		.select({
			id: auditLog.id,
			action: auditLog.action,
			entityType: auditLog.entityType,
			entityId: auditLog.entityId,
			metadata: auditLog.metadata,
			ipAddress: auditLog.ipAddress,
			createdAt: auditLog.createdAt,
			userName: user.name,
			userEmail: user.email
		})
		.from(auditLog)
		.leftJoin(user, eq(user.id, auditLog.userId))
		.where(and(...(clauses.filter(Boolean) as SQL[])))
		.orderBy(desc(auditLog.createdAt))
		// Paged rather than capped: the point of an audit log is that you can
		// reach the old entries, not just the recent ones.
		.limit(perPage + 1)
		.offset((page - 1) * perPage);

	const hasMore = rows.length > perPage;

	return {
		rows: rows.slice(0, perPage),
		hasMore,
		page,
		filters: { search, action, entityType, days }
	};
};
