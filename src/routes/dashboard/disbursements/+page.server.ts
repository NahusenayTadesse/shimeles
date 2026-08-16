import { asc, desc, isNull } from 'drizzle-orm';
import { contentCrud } from '$lib/server/crud';
import { beneficiaries, disbursements, formSubmissions, pillars } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Disbursements.
 *
 * Generic CRUD, but note the permission split §3.10 asks for: `finance` holds
 * `disbursements.read` and sees amounts and dates, while the case narrative
 * that explains *why* lives on the case file behind `submissions.read`, which
 * finance does not have. The `narrative` column here is the short purpose line,
 * not the medical detail.
 */
const crud = contentCrud({
	table: disbursements,
	label: 'Disbursement',
	addSchema,
	editSchema,
	permission: 'disbursements.write',
	entity: 'disbursement',
	invalidates: ['impact']
});

export const load: PageServerLoad = async (event) => {
	const base = await crud.load(event);

	const [pillarOptions, beneficiaryOptions, caseOptions] = await Promise.all([
		db
			.select({ id: pillars.id, name: pillars.name })
			.from(pillars)
			.where(isNull(pillars.deletedAt))
			.orderBy(asc(pillars.sortOrder)),
		db
			.select({ id: beneficiaries.id, fullName: beneficiaries.fullName })
			.from(beneficiaries)
			.where(isNull(beneficiaries.deletedAt))
			.orderBy(asc(beneficiaries.fullName))
			.limit(500),
		db
			.select({ id: formSubmissions.id, reference: formSubmissions.referenceNumber })
			.from(formSubmissions)
			.where(isNull(formSubmissions.deletedAt))
			.orderBy(desc(formSubmissions.createdAt))
			.limit(500)
	]);

	return { ...base, pillarOptions, beneficiaryOptions, caseOptions };
};

export const actions: Actions = crud.actions;
