import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { contentCrud } from '$lib/server/crud';
import { beneficiaries, disbursements, formSubmissions, pillars } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { pillarScope, requirePermission } from '$lib/server/permissions';
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
 *
 * §3.10 also applies to the rows themselves, which is what `pillarColumn` is
 * for. A disbursement hangs off a case, so a caseworker assigned to Mental
 * Wellness must not see — or edit, or delete — a Medical Hardship payment, and
 * that has to be a WHERE clause rather than something the UI leaves out. The
 * option pickers below are scoped the same way: a screen that hides the rows
 * but lists every beneficiary's name in a dropdown has not hidden anything.
 */
const crud = contentCrud({
	table: disbursements,
	label: 'Disbursement',
	addSchema,
	editSchema,
	permission: 'disbursements.write',
	entity: 'disbursement',
	pillarColumn: disbursements.pillarId,
	invalidates: ['impact'],

	/**
	 * The pillar is read back from the case the payment is against, never taken
	 * from the form.
	 *
	 * Otherwise the scope check has a hole exactly the size of the field it
	 * checks: post another programme's `formSubmissionId` with `pillarId` blank
	 * and the row is written with a null pillar, which is visible to everyone
	 * and attached to a case the writer cannot open.
	 */
	beforeWrite: async (values) => {
		if (!values.formSubmissionId) return values;

		const [submission] = await db
			.select({ pillarId: formSubmissions.pillarId })
			.from(formSubmissions)
			.where(eq(formSubmissions.id, Number(values.formSubmissionId)))
			.limit(1);

		return submission ? { ...values, pillarId: submission.pillarId } : values;
	}
});

export const load: PageServerLoad = async (event) => {
	const access = await requirePermission(event, 'disbursements.write');
	const base = await crud.load(event);

	// A beneficiary is reachable through a case, so the names offered here are
	// the ones from cases this user can already open. `pillarScope` rather than
	// `pillarScopeOrNull`: an unfiled case is not a reason to list the person.
	const caseScope = pillarScope(access, formSubmissions.pillarId);

	const [pillarOptions, beneficiaryOptions, caseOptions] = await Promise.all([
		db
			.select({ id: pillars.id, name: pillars.name })
			.from(pillars)
			.where(and(isNull(pillars.deletedAt), pillarScope(access, pillars.id)))
			.orderBy(asc(pillars.sortOrder)),

		db
			.selectDistinct({ id: beneficiaries.id, fullName: beneficiaries.fullName })
			.from(beneficiaries)
			.innerJoin(formSubmissions, eq(formSubmissions.submittedByBeneficiaryId, beneficiaries.id))
			.where(and(isNull(beneficiaries.deletedAt), isNull(formSubmissions.deletedAt), caseScope))
			.orderBy(asc(beneficiaries.fullName))
			.limit(500),

		db
			.select({ id: formSubmissions.id, reference: formSubmissions.referenceNumber })
			.from(formSubmissions)
			.where(and(isNull(formSubmissions.deletedAt), caseScope))
			.orderBy(desc(formSubmissions.createdAt))
			.limit(500)
	]);

	return { ...base, pillarOptions, beneficiaryOptions, caseOptions };
};

export const actions: Actions = crud.actions;
