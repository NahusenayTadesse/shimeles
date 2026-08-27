import { error, type RequestEvent } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { db } from '$lib/server/db';
import {
	volunteerApplications,
	volunteerApplicationSkills,
	volunteerAvailability,
	volunteerCredentials,
	volunteerReferences
} from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { getVolunteerCatalog, updateVolunteerDetails } from '$lib/server/volunteers';
import { adminDetailsSchema } from '../../../../volunteer/schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * Filling in a volunteer's details from this side of the desk.
 *
 * The other half of the completion link: not every volunteer is going to open a
 * form on a phone, and a coordinator who has just spent ten minutes on the
 * telephone needs somewhere to put what they heard.
 *
 * Two rules make this screen different from the volunteer's own:
 *
 * 1. **Nothing is required.** `adminDetailsSchema` relaxes every minimum, so
 *    half a phone call can be saved and finished later. The safeguarding gate
 *    is untouched — an incomplete file still cannot be approved.
 * 2. **The declarations are not on it.** A consent timestamp records the moment
 *    a person agreed to something, and nobody can agree on their behalf. Those
 *    four are shown here as facts, and asked only through the volunteer's link.
 */
async function load_(
	event: RequestEvent<{ id: string }>,
	permission: 'volunteers.read' | 'volunteers.write'
) {
	await requirePermission(event, permission);
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(404, 'Not found');

	const [application] = await db
		.select()
		.from(volunteerApplications)
		.where(and(eq(volunteerApplications.id, id), isNull(volunteerApplications.deletedAt)))
		.limit(1);

	if (!application) throw error(404, 'That volunteer application does not exist.');

	return { id, application };
}

export const load: PageServerLoad = async (event) => {
	const { id, application } = await load_(event, 'volunteers.read');

	const [catalog, skills, availability, credentials, references] = await Promise.all([
		getVolunteerCatalog(),
		db
			.select()
			.from(volunteerApplicationSkills)
			.where(eq(volunteerApplicationSkills.volunteerApplicationId, id)),
		db
			.select()
			.from(volunteerAvailability)
			.where(eq(volunteerAvailability.volunteerApplicationId, id)),
		db
			.select()
			.from(volunteerCredentials)
			.where(
				and(
					eq(volunteerCredentials.volunteerApplicationId, id),
					isNull(volunteerCredentials.deletedAt)
				)
			),
		db
			.select()
			.from(volunteerReferences)
			.where(
				and(
					eq(volunteerReferences.volunteerApplicationId, id),
					isNull(volunteerReferences.deletedAt)
				)
			)
	]);

	const form = await superValidate(zod4(adminDetailsSchema), {
		defaults: {
			city: application.city ?? '',
			regionId: application.regionId,
			country: application.country ?? '',
			dateOfBirth: application.dateOfBirth ?? '',
			gender: application.gender,
			occupation: application.occupation ?? '',
			organisationName: application.organisationName ?? '',
			emergencyContactName: application.emergencyContactName ?? '',
			emergencyContactPhone: application.emergencyContactPhone ?? '',
			emergencyContactRelationship: application.emergencyContactRelationship ?? '',
			skills: skills.map((row) => ({ skillId: row.skillId, proficiency: row.proficiency })),
			otherSkills: (application.skills ?? []).join('\n'),
			timeSlotIds: availability.map((row) => row.timeSlotId),
			availabilityNote: application.availability ?? '',
			hoursPerWeek: application.hoursPerWeek,
			commitmentMonths: application.commitmentMonths,
			availableFrom: application.availableFrom ?? '',
			heardAbout: application.heardAbout ?? '',
			isProfessional: credentials.length > 0,
			credentials: credentials.map((row) => ({
				professionId: row.professionId,
				otherProfession: row.otherProfession ?? '',
				licenseNumber: row.licenseNumber ?? '',
				licensingBody: row.licensingBody ?? '',
				specialization: row.specialization ?? '',
				yearsExperience: row.yearsExperience,
				issuedOn: row.issuedOn ?? '',
				expiresOn: row.expiresOn ?? ''
			})),
			references: references.map((row) => ({
				fullName: row.fullName,
				relationship: row.relationship ?? '',
				organization: row.organization ?? '',
				email: row.email ?? '',
				phone: row.phone ?? ''
			})),
			hasPriorConviction: application.hasPriorConviction,
			priorConvictionDetail: application.priorConvictionDetail ?? ''
		},
		errors: false
	});

	return {
		form,
		catalog,
		application: {
			id: application.id,
			fullName: application.fullName,
			reference: application.referenceNumber,
			motivation: application.motivation
		},
		// Shown, not asked. Only the volunteer's own submission moves these.
		declarations: {
			backgroundCheckConsentAt: application.backgroundCheckConsentAt,
			codeOfConductAgreedAt: application.codeOfConductAgreedAt,
			declaredAccurateAt: application.declaredAccurateAt,
			acknowledgedNoGuaranteeAt: application.acknowledgedNoGuaranteeAt
		},
		// Rows a safeguarding officer has already acted on, which this screen
		// will not replace however the form is resubmitted.
		locked: {
			credentials: credentials.filter((row) => row.verificationStatus !== 'pending').length,
			references: references.filter((row) => row.status !== 'pending').length
		}
	};
};

export const actions: Actions = {
	save: async (event) => {
		const { id } = await load_(event, 'volunteers.write');
		const form = await superValidate(event.request, zod4(adminDetailsSchema));

		if (!form.valid) {
			return message(
				form,
				{ type: 'error', text: 'Please check the highlighted fields.' },
				{ status: 400 }
			);
		}

		const data = form.data;
		const trim = (value: string | null | undefined) => value?.trim() || null;

		try {
			await updateVolunteerDetails(event, id, {
				city: trim(data.city),
				regionId: data.regionId ?? null,
				country: trim(data.country),
				dateOfBirth: trim(data.dateOfBirth),
				gender: data.gender ?? null,
				occupation: trim(data.occupation),
				organisationName: trim(data.organisationName),
				emergencyContactName: trim(data.emergencyContactName),
				emergencyContactPhone: trim(data.emergencyContactPhone),
				emergencyContactRelationship: trim(data.emergencyContactRelationship),
				skills: data.skills ?? [],
				otherSkills: (data.otherSkills ?? '')
					.split('\n')
					.map((line) => line.trim())
					.filter(Boolean),
				timeSlotIds: data.timeSlotIds ?? [],
				availabilityNote: trim(data.availabilityNote),
				hoursPerWeek: data.hoursPerWeek ?? null,
				commitmentMonths: data.commitmentMonths ?? null,
				availableFrom: trim(data.availableFrom),
				heardAbout: trim(data.heardAbout),
				credentials: data.isProfessional
					? (data.credentials ?? []).map((credential) => ({
							professionId: credential.professionId,
							otherProfession: trim(credential.otherProfession),
							licenseNumber: trim(credential.licenseNumber),
							licensingBody: trim(credential.licensingBody),
							specialization: trim(credential.specialization),
							yearsExperience: credential.yearsExperience,
							issuedOn: trim(credential.issuedOn),
							expiresOn: trim(credential.expiresOn)
						}))
					: [],
				references: (data.references ?? []).map((reference) => ({
					fullName: reference.fullName,
					relationship: trim(reference.relationship),
					organization: trim(reference.organization),
					email: trim(reference.email),
					phone: trim(reference.phone)
				})),
				hasPriorConviction: data.hasPriorConviction ?? null,
				priorConvictionDetail: trim(data.priorConvictionDetail)
			});

			return message(form, { type: 'success', text: 'Saved.' });
		} catch (err) {
			console.error('Volunteer details save failed:', err);
			return message(
				form,
				{ type: 'error', text: 'We could not save that. Please try again.' },
				{ status: 500 }
			);
		}
	}
};
