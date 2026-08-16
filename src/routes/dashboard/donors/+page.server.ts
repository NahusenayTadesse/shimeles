import { desc, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { donors } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { auditList } from '$lib/server/audit';
import type { PageServerLoad } from './$types';

/**
 * The donor ledger. Read-only here: a donor record is built from what someone
 * typed on the public form and adjusted by reconciliation, and hand-editing a
 * lifetime total would decouple it from the donations that justify it.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'donations.read');

	const rows = await db
		.select()
		.from(donors)
		.where(isNull(donors.deletedAt))
		.orderBy(desc(donors.lifetimeTotal))
		.limit(500);

	auditList(event, 'donor', { results: rows.length });

	return { rows };
};
