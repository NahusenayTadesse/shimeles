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
	const match = input.email
		? eq(donors.email, input.email)
		: input.phone
			? eq(donors.phone, input.phone)
			: null;

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
					phone: input.phone ?? undefined,
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
			email: input.email,
			phone: input.phone,
			organisationName: input.organisationName ?? null,
			country: input.country ?? null,
			isDiaspora: input.isDiaspora,
			userId: input.userId
		})
		.returning({ id: donors.id });

	return created.id;
}
