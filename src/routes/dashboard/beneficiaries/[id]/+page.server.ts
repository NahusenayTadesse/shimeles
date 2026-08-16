import { error } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	beneficiaries,
	disbursements,
	formDefinitions,
	formSubmissions,
	households,
	pillars,
	regions,
	statusOptions
} from '$lib/server/db/schema';
import { pillarScope, requirePermission } from '$lib/server/permissions';
import { audit } from '$lib/server/audit';
import type { PageServerLoad } from './$types';

/**
 * One beneficiary's history.
 *
 * This is the continuity-of-care view §3.4 asks for: everything this person or
 * household has been through, in one place, so a caseworker meeting them for
 * the second time is not starting from nothing.
 *
 * The submissions list is pillar-scoped. A Mental Wellness caseworker opening a
 * beneficiary who has also had a Medical Hardship case sees the person and
 * their Mental Wellness history, and no trace of the medical one — which is the
 * §3.10 rule applied at exactly the point it is easiest to get wrong.
 */
export const load: PageServerLoad = async (event) => {
	const access = await requirePermission(event, 'beneficiaries.read');
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(404, 'Not found');

	const [beneficiary] = await db
		.select({
			id: beneficiaries.id,
			fullName: beneficiaries.fullName,
			phone: beneficiaries.phone,
			email: beneficiaries.email,
			dateOfBirth: beneficiaries.dateOfBirth,
			gender: beneficiaries.gender,
			preferredLanguage: beneficiaries.preferredLanguage,
			notes: beneficiaries.notes,
			createdAt: beneficiaries.createdAt,
			householdId: beneficiaries.householdId,
			householdLabel: households.label,
			regionName: regions.name
		})
		.from(beneficiaries)
		.leftJoin(households, eq(households.id, beneficiaries.householdId))
		.leftJoin(regions, eq(regions.id, beneficiaries.regionId))
		.where(and(eq(beneficiaries.id, id), isNull(beneficiaries.deletedAt)))
		.limit(1);

	if (!beneficiary) throw error(404, 'That beneficiary does not exist.');

	const scope = pillarScope(access, formSubmissions.pillarId);

	const [submissions, payments, householdMembers] = await Promise.all([
		db
			.select({
				id: formSubmissions.id,
				reference: formSubmissions.referenceNumber,
				createdAt: formSubmissions.createdAt,
				closedAt: formSubmissions.closedAt,
				formName: formDefinitions.name,
				pillarName: pillars.name,
				statusLabel: statusOptions.label,
				statusColor: statusOptions.color
			})
			.from(formSubmissions)
			.innerJoin(formDefinitions, eq(formDefinitions.id, formSubmissions.formDefinitionId))
			.leftJoin(pillars, eq(pillars.id, formSubmissions.pillarId))
			.leftJoin(statusOptions, eq(statusOptions.id, formSubmissions.statusId))
			.where(
				and(
					eq(formSubmissions.submittedByBeneficiaryId, id),
					isNull(formSubmissions.deletedAt),
					...(scope ? [scope] : [])
				)
			)
			.orderBy(desc(formSubmissions.createdAt)),

		db
			.select({
				id: disbursements.id,
				amount: disbursements.amount,
				currency: disbursements.currency,
				paidTo: disbursements.paidTo,
				date: disbursements.disbursementDate,
				fundSource: disbursements.fundSource,
				pillarName: pillars.name
			})
			.from(disbursements)
			.leftJoin(pillars, eq(pillars.id, disbursements.pillarId))
			.where(and(eq(disbursements.beneficiaryId, id), isNull(disbursements.deletedAt)))
			.orderBy(desc(disbursements.disbursementDate)),

		beneficiary.householdId
			? db
					.select({ id: beneficiaries.id, fullName: beneficiaries.fullName })
					.from(beneficiaries)
					.where(
						and(
							eq(beneficiaries.householdId, beneficiary.householdId),
							isNull(beneficiaries.deletedAt)
						)
					)
			: Promise.resolve([])
	]);

	audit({
		event,
		action: 'viewed',
		entityType: 'beneficiary',
		entityId: id,
		metadata: { submissions: submissions.length }
	});

	return {
		beneficiary,
		submissions,
		payments,
		householdMembers: householdMembers.filter((member) => member.id !== id),
		// Shown so a caseworker understands why the history might look short.
		isScoped: access.pillarIds !== null
	};
};
