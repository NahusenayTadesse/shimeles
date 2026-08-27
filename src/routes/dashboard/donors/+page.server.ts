import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { donations, donors } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { auditList } from '$lib/server/audit';
import { toMoneyTotals } from '$lib/money';
import type { PageServerLoad } from './$types';

/**
 * The donor ledger. Read-only here: a donor record is built from what someone
 * typed on the public form and adjusted by reconciliation, and hand-editing a
 * lifetime total would decouple it from the donations that justify it.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'donations.read');

	const donorRows = await db
		.select()
		.from(donors)
		.where(isNull(donors.deletedAt))
		.orderBy(desc(donors.lifetimeTotal))
		.limit(500);

	/**
	 * The full lifetime picture, one total per currency.
	 *
	 * `donors.lifetime_total` is a single number against a single
	 * `lifetime_currency`, so it can only ever carry the donor's largest
	 * currency (see the reconcile action) — it is the sort key and nothing
	 * more. A diaspora supporter who gives dollars *and* wires birr has two
	 * lifetime totals, and adding them was the bug this replaces.
	 */
	const lifetimeRows = await db
		.select({
			donorId: donations.donorId,
			currency: donations.currency,
			amount: sql<number>`coalesce(sum(${donations.amount}), 0)`
		})
		.from(donations)
		.where(and(eq(donations.status, 'completed'), isNull(donations.deletedAt)))
		.groupBy(donations.donorId, donations.currency);

	const rows = donorRows.map((donor) => ({
		...donor,
		lifetimeTotals: toMoneyTotals(lifetimeRows.filter((row) => row.donorId === donor.id))
	}));

	auditList(event, 'donor', { results: rows.length });

	return { rows };
};
