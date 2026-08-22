import { and, asc, eq, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	futureInitiatives,
	inKindDonationItems,
	inKindDonations,
	pillars,
	regions,
	user
} from '$lib/server/db/schema';
import { searchFilter } from '$lib/server/query';
import { requirePermission } from '$lib/server/permissions';
import { auditList } from '$lib/server/audit';
import type { PageServerLoad } from './$types';

/**
 * The in-kind queue.
 *
 * The job this screen exists for is not "browse gifts of goods", it is
 * **decide, then collect**. An offer sitting here untouched is a donor at home
 * with four boxes in their hallway waiting for a phone call, and unlike a bank
 * transfer it can go off, get given elsewhere, or be thrown out. So the
 * default view is what nobody has answered yet, oldest first, and the two
 * things that make an offer urgent — perishable goods, and a collection booked
 * for today — are counted separately at the top rather than left to be noticed.
 *
 * Not pillar-scoped: an offer is not case data, and the goods are pooled
 * before anybody decides which family they reach.
 *
 * This screen has no actions of its own. Accepting a gift means having looked
 * at what it is, and a one-click accept on a queue row is how a foundation
 * ends up committing to collect a sofa it has nowhere to put — so every write
 * lives on the detail screen.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'inkind.read');

	const params = event.url.searchParams;
	const status = params.get('status') ?? 'open';
	const search = params.get('q')?.trim() ?? '';
	const handover = params.get('handover');
	const perishable = params.get('perishable') === '1';

	const clauses: (SQL | undefined)[] = [isNull(inKindDonations.deletedAt)];

	// "Open" is the working queue: everything that still needs somebody to do
	// something. It is the default because a status-less list of every offer
	// ever made is not a queue, it is an archive.
	if (status === 'open') {
		clauses.push(
			or(
				eq(inKindDonations.status, 'offered'),
				eq(inKindDonations.status, 'under_review'),
				eq(inKindDonations.status, 'accepted'),
				eq(inKindDonations.status, 'scheduled')
			)
		);
	} else if (status !== 'all') {
		clauses.push(eq(inKindDonations.status, status as never));
	}

	if (handover) clauses.push(eq(inKindDonations.handoverMethod, handover as never));
	if (perishable) clauses.push(eq(inKindDonations.isPerishable, true));

	const searchClause = searchFilter(search, [
		inKindDonations.referenceCode,
		inKindDonations.donorName,
		inKindDonations.organisationName,
		inKindDonations.donorEmail,
		inKindDonations.donorPhone,
		inKindDonations.summary,
		inKindDonations.pickupCity
	]);
	if (searchClause) clauses.push(searchClause);

	const today = new Date().toISOString().slice(0, 10);

	const [rows, totals, dueToday, unansweredPerishable, intake] = await Promise.all([
		db
			.select({
				id: inKindDonations.id,
				reference: inKindDonations.referenceCode,
				summary: inKindDonations.summary,
				itemCount: inKindDonations.itemCount,
				totalQuantity: inKindDonations.totalQuantity,
				estimatedValue: inKindDonations.estimatedValue,
				currency: inKindDonations.currency,
				status: inKindDonations.status,
				donorName: inKindDonations.donorName,
				organisationName: inKindDonations.organisationName,
				donorType: inKindDonations.donorType,
				donorEmail: inKindDonations.donorEmail,
				donorPhone: inKindDonations.donorPhone,
				isAnonymous: inKindDonations.isAnonymous,
				handoverMethod: inKindDonations.handoverMethod,
				pickupCity: inKindDonations.pickupCity,
				loadSize: inKindDonations.loadSize,
				isPerishable: inKindDonations.isPerishable,
				needsColdStorage: inKindDonations.needsColdStorage,
				hasRestrictedItems: inKindDonations.hasRestrictedItems,
				requiresVehicle: inKindDonations.requiresVehicle,
				availableUntil: inKindDonations.availableUntil,
				scheduledFor: inKindDonations.scheduledFor,
				isRead: inKindDonations.isRead,
				createdAt: inKindDonations.createdAt,
				pillarName: pillars.name,
				initiativeName: futureInitiatives.name,
				regionName: regions.name,
				assigneeName: user.name,
				/** The soonest use-by date on the offer; what makes it a hurry. */
				expiresOn: sql<string | null>`(
					select min(expires_on) from in_kind_donation_items i
					where i.in_kind_donation_id = ${inKindDonations.id} and i.expires_on is not null
				)`
			})
			.from(inKindDonations)
			.leftJoin(pillars, eq(pillars.id, inKindDonations.designationPillarId))
			.leftJoin(
				futureInitiatives,
				eq(futureInitiatives.id, inKindDonations.designationInitiativeId)
			)
			.leftJoin(regions, eq(regions.id, inKindDonations.regionId))
			.leftJoin(user, eq(user.id, inKindDonations.assignedToId))
			.where(and(...(clauses.filter(Boolean) as SQL[])))
			// Unread first, then oldest — the queue reads top-down as "answer this
			// one next", which is the only order that makes it a queue.
			.orderBy(asc(inKindDonations.isRead), asc(inKindDonations.createdAt))
			.limit(500),

		db
			.select({
				status: inKindDonations.status,
				total: sql<number>`count(*)`,
				items: sql<number>`coalesce(sum(${inKindDonations.totalQuantity}), 0)`
			})
			.from(inKindDonations)
			.where(isNull(inKindDonations.deletedAt))
			.groupBy(inKindDonations.status),

		// Collections booked for today or already overdue, which is the one
		// thing on this screen with a van attached to it.
		db
			.select({ total: sql<number>`count(*)` })
			.from(inKindDonations)
			.where(
				and(
					isNull(inKindDonations.deletedAt),
					eq(inKindDonations.status, 'scheduled'),
					lte(inKindDonations.scheduledFor, today)
				)
			)
			.then((r) => Number(r[0]?.total ?? 0)),

		db
			.select({ total: sql<number>`count(*)` })
			.from(inKindDonations)
			.where(
				and(
					isNull(inKindDonations.deletedAt),
					eq(inKindDonations.isPerishable, true),
					or(eq(inKindDonations.status, 'offered'), eq(inKindDonations.status, 'under_review'))
				)
			)
			.then((r) => Number(r[0]?.total ?? 0)),

		// What was actually taken in, which is the accepted quantities and not the
		// offered ones. Summing `total_quantity` here would report the four boxes
		// somebody promised rather than the three that turned up, and a stock
		// figure that flatters itself is worse than none.
		db
			.select({
				items: sql<number>`coalesce(sum(coalesce(${inKindDonationItems.acceptedQuantity}, 0)), 0)`,
				gifts: sql<number>`count(distinct ${inKindDonations.id})`
			})
			.from(inKindDonationItems)
			.innerJoin(inKindDonations, eq(inKindDonations.id, inKindDonationItems.inKindDonationId))
			.where(
				and(
					isNull(inKindDonations.deletedAt),
					isNull(inKindDonationItems.deletedAt),
					inArray(inKindDonations.status, ['received', 'distributed'])
				)
			)
			.then((r) => ({ items: Number(r[0]?.items ?? 0), gifts: Number(r[0]?.gifts ?? 0) }))
	]);

	auditList(event, 'in_kind_donation', { status, search, results: rows.length });

	return {
		rows,
		totals,
		dueToday,
		unansweredPerishable,
		intake,
		today,
		filters: { status, search, handover: handover ?? '', perishable }
	};
};
