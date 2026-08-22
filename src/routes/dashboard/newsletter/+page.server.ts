import { fail } from '@sveltejs/kit';
import { and, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { newsletterSubscribers } from '$lib/server/db/schema';
import { searchFilter } from '$lib/server/query';
import { requirePermission } from '$lib/server/permissions';
import { audit, auditList } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * The newsletter list.
 *
 * A viewer, deliberately: addresses arrive from the homepage signup, the
 * donation flow and the contact form, and the one thing staff need is to see
 * who is on the list and get them off it when asked. There is no "add" — a
 * subscriber nobody opted in is not a subscriber, and a screen that can create
 * them is a screen that will be used to paste in a bought list.
 *
 * Unsubscribing is a status change rather than a delete, so an address that
 * asked to be removed is not silently re-added by the next signup form.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'submissions.read');

	const params = event.url.searchParams;
	const search = params.get('q')?.trim() ?? '';
	const source = params.get('source') ?? '';
	const state = params.get('state') ?? 'active';

	const clauses: (SQL | undefined)[] = [];

	if (state === 'active') clauses.push(eq(newsletterSubscribers.isActive, true));
	if (state === 'unsubscribed') clauses.push(eq(newsletterSubscribers.isActive, false));
	if (source) {
		clauses.push(
			eq(
				newsletterSubscribers.source,
				source as 'homepage' | 'donation_flow' | 'manual' | 'footer' | 'contact_form'
			)
		);
	}
	const searchClause = searchFilter(search, [
		newsletterSubscribers.email,
		newsletterSubscribers.name
	]);
	if (searchClause) clauses.push(searchClause);

	const where = clauses.length ? and(...(clauses.filter(Boolean) as SQL[])) : undefined;

	const [rows, totals, bySource] = await Promise.all([
		db
			.select({
				id: newsletterSubscribers.id,
				email: newsletterSubscribers.email,
				name: newsletterSubscribers.name,
				source: newsletterSubscribers.source,
				isActive: newsletterSubscribers.isActive,
				preferredLanguage: newsletterSubscribers.preferredLanguage,
				subscribedAt: newsletterSubscribers.subscribedAt,
				unsubscribedAt: newsletterSubscribers.unsubscribedAt
			})
			.from(newsletterSubscribers)
			.where(where)
			.orderBy(desc(newsletterSubscribers.subscribedAt))
			.limit(1000),

		db
			.select({
				total: count(),
				active: sql<number>`sum(case when ${newsletterSubscribers.isActive} then 1 else 0 end)`
			})
			.from(newsletterSubscribers),

		// The signup routes that are actually working, which is the one question
		// this screen can answer that a spreadsheet export cannot.
		db
			.select({ source: newsletterSubscribers.source, total: count() })
			.from(newsletterSubscribers)
			.where(eq(newsletterSubscribers.isActive, true))
			.groupBy(newsletterSubscribers.source)
	]);

	auditList(event, 'newsletter_subscriber', {
		search,
		source,
		state,
		results: rows.length
	});

	return {
		rows,
		totals: { total: totals[0]?.total ?? 0, active: Number(totals[0]?.active ?? 0) },
		bySource,
		filters: { search, source, state }
	};
};

export const actions: Actions = {
	/**
	 * Marks someone unsubscribed, or puts them back.
	 *
	 * The row is kept either way. An address that asked to be removed has to
	 * stay on file as removed — deleting it means the next signup form quietly
	 * re-adds them and nobody can show they ever opted out.
	 */
	setSubscribed: async (event) => {
		await requirePermission(event, 'submissions.write');
		const formData = await event.request.formData();
		const id = Number(formData.get('id'));
		const subscribed = String(formData.get('subscribed')) === 'true';

		if (!Number.isFinite(id)) return fail(400, { error: 'Unknown subscriber.' });

		await db
			.update(newsletterSubscribers)
			.set({
				isActive: subscribed,
				unsubscribedAt: subscribed ? null : new Date()
			})
			.where(eq(newsletterSubscribers.id, id));

		audit({
			event,
			action: 'updated',
			entityType: 'newsletter_subscriber',
			entityId: id,
			metadata: { isActive: subscribed }
		});

		return { ok: true, message: subscribed ? 'Resubscribed.' : 'Unsubscribed.' };
	}
};
