import { asc, isNull } from 'drizzle-orm';
import { contentCrud } from '$lib/server/crud';
import { beneficiaries, households, regions } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Beneficiaries.
 *
 * Note that this list is *not* pillar-scoped, and deliberately so: a
 * beneficiary record holds a name and a phone number, not case detail. The
 * §3.10 privacy rule is about case notes and documents, which live on
 * `form_submissions` and are scoped there — and a caseworker needs to be able
 * to find out that this family already has a record before creating a second.
 */
const crud = contentCrud({
	table: beneficiaries,
	label: 'Beneficiary',
	addSchema,
	editSchema,
	permission: 'beneficiaries.write',
	entity: 'beneficiary'
});

export const load: PageServerLoad = async (event) => {
	const base = await crud.load(event);

	const [householdOptions, regionOptions] = await Promise.all([
		db
			.select({ id: households.id, label: households.label })
			.from(households)
			.where(isNull(households.deletedAt))
			.orderBy(asc(households.label)),
		db
			.select({ id: regions.id, name: regions.name })
			.from(regions)
			.where(isNull(regions.deletedAt))
			.orderBy(asc(regions.sortOrder))
	]);

	return { ...base, householdOptions, regionOptions };
};

export const actions: Actions = crud.actions;
