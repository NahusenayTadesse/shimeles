import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { donors } from '$lib/server/db/schema';

/**
 * Finds the donor behind a gift, or creates them.
 *
 * Matching is on email first, then phone — a donor who gives three times a
 * year should be one row with a lifetime total, not three rows. `lifetimeTotal`
 * itself is only moved when a donation is reconciled, so it reflects money
 * received rather than money promised.
 *
 * Shared between the cash and in-kind paths on purpose: somebody who sends
 * birr in March and four boxes of coats in October is one supporter, and the
 * rule that decides so must not exist twice.
 */
export async function upsertDonor(input: {
	fullName: string;
	email: string | null;
	phone: string | null;
	/** Null for a person giving in their own name, which is most donors. */
	organisationName?: string | null;
	country?: string | null;
	isDiaspora: boolean;
	userId: string | null;
}): Promise<number> {
	// Normalised here rather than trusted from the caller. Addresses are matched
	// exactly, so `Abebe@Example.com` and `abebe@example.com` would otherwise be
	// two supporters with two lifetime totals — and the three call sites happened
	// to agree on lowercasing only by convention, which is not a guarantee.
	const email = input.email?.trim().toLowerCase() || null;
	const phone = input.phone?.trim() || null;

	const match = email ? eq(donors.email, email) : phone ? eq(donors.phone, phone) : null;

	if (match) {
		const [existing] = await db
			.select({ id: donors.id })
			.from(donors)
			.where(and(match, isNull(donors.deletedAt)))
			.orderBy(desc(donors.id))
			.limit(1);

		if (existing) {
			await db
				.update(donors)
				.set({
					fullName: input.fullName,
					phone: phone ?? undefined,
					// `?? undefined` throughout, never `?? null`: a gift that did not
					// ask for the organisation or the country must not erase what an
					// earlier one recorded.
					organisationName: input.organisationName ?? undefined,
					country: input.country ?? undefined,
					isDiaspora: input.isDiaspora,
					updatedAt: new Date()
				})
				.where(eq(donors.id, existing.id));
			return existing.id;
		}
	}

	const [created] = await db
		.insert(donors)
		.values({
			fullName: input.fullName,
			email,
			phone,
			organisationName: input.organisationName ?? null,
			country: input.country ?? null,
			isDiaspora: input.isDiaspora,
			userId: input.userId
		})
		.returning({ id: donors.id });

	return created.id;
}
