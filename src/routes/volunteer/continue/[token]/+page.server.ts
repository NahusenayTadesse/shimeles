import { error } from '@sveltejs/kit';
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
import { getVolunteerCatalog, updateVolunteerDetails } from '$lib/server/volunteers';
import { findActiveInvite, markInviteCompleted } from '$lib/server/volunteer-invites';
import { visibleFieldKeys } from '$lib/volunteer-form-parts';
import { detailsSchemaFor } from '../../schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * `/volunteer/continue/[token]` — the rest of a volunteer's application.
 *
 * Reached only from a link a coordinator sent, after they have spoken to the
 * person. The token is the whole of the authorisation: there is no session
 * here, and the page is public in the sense that anyone holding the URL can
 * open it. That is why the token is 192 random bits and why the form is
 * scoped to one application — it can write to the row it was issued for and
 * to no other.
 *
 * **Everything that is not asked is not written.** The schema is built from
 * the parts the coordinator left switched on, and `updateVolunteerDetails`
 * writes only the keys it receives. A coordinator who hid the availability
 * section is not blanking the availability somebody already recorded.
 *
 * An unknown token, a deactivated link and a deleted application all 404 in
 * exactly the same way. A coordinator who switches a link off has withdrawn
 * it, and a page that said "this existed once" would be saying more than they
 * chose to.
 */
const inviteOr404 = async (token: string) => {
	const invite = await findActiveInvite(token);
	if (!invite) throw error(404, 'Not found');
	return invite;
};

export const load: PageServerLoad = async (event) => {
	// This URL is one person's way into their own file. `/files` is deliberately
	// crawlable and protects itself with a per-file `X-Robots-Tag`; this is the
	// same defence, and the header is what a crawler obeys however it arrived.
	event.setHeaders({ 'x-robots-tag': 'noindex, nofollow' });

	const invite = await inviteOr404(event.params.token);
	const visible = visibleFieldKeys(invite.hiddenParts ?? []);

	const [catalog, [application], skills, availability, credentials, references] = await Promise.all(
		[
			getVolunteerCatalog(),
			db
				.select()
				.from(volunteerApplications)
				.where(
					and(
						eq(volunteerApplications.id, invite.applicationId),
						isNull(volunteerApplications.deletedAt)
					)
				)
				.limit(1),
			db
				.select()
				.from(volunteerApplicationSkills)
				.where(eq(volunteerApplicationSkills.volunteerApplicationId, invite.applicationId)),
			db
				.select()
				.from(volunteerAvailability)
				.where(eq(volunteerAvailability.volunteerApplicationId, invite.applicationId)),
			db
				.select()
				.from(volunteerCredentials)
				.where(
					and(
						eq(volunteerCredentials.volunteerApplicationId, invite.applicationId),
						isNull(volunteerCredentials.deletedAt)
					)
				),
			db
				.select()
				.from(volunteerReferences)
				.where(
					and(
						eq(volunteerReferences.volunteerApplicationId, invite.applicationId),
						isNull(volunteerReferences.deletedAt)
					)
				)
		]
	);

	if (!application) throw error(404, 'Not found');

	// Whatever is already on the file comes back prefilled, so somebody
	// reopening the link is correcting their answers rather than retyping them.
	// The declarations are the exception: a tick restored from the database
	// would be the form agreeing on their behalf, so they start clear and are
	// only ever stamped forward (see `updateVolunteerDetails`).
	const defaults = {
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
		// Two blocks from the start rather than added by a button, because two
		// is the requirement and an empty section reads as optional.
		references: references.length
			? references.map((row) => ({
					fullName: row.fullName,
					relationship: row.relationship ?? '',
					organization: row.organization ?? '',
					email: row.email ?? '',
					phone: row.phone ?? ''
				}))
			: [
					{ fullName: '', relationship: '', organization: '', email: '', phone: '' },
					{ fullName: '', relationship: '', organization: '', email: '', phone: '' }
				],
		hasPriorConviction: application.hasPriorConviction,
		priorConvictionDetail: application.priorConvictionDetail ?? '',
		consentBackgroundCheck: false,
		agreeCodeOfConduct: false,
		declareAccurate: false,
		acknowledgeNoGuarantee: false
	};

	const visibleKeys = [...visible];
	const form = await superValidate(zod4(detailsSchemaFor(invite.hiddenParts ?? [])), {
		defaults: Object.fromEntries(
			Object.entries(defaults).filter(([key]) => visible.has(key))
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		) as any,
		errors: false
	});

	return {
		form,
		catalog,
		visible: visibleKeys,
		volunteer: { fullName: application.fullName, reference: application.referenceNumber },
		alreadyCompleted: Boolean(invite.completedAt)
	};
};

export const actions: Actions = {
	save: async (event) => {
		// Re-read rather than trusted from the load: the link may have been
		// switched off, or its hidden parts changed, while the form sat open.
		// The schema that validates is the one the invite says now.
		const invite = await inviteOr404(event.params.token);
		const schema = detailsSchemaFor(invite.hiddenParts ?? []);

		const form = await superValidate(event.request, zod4(schema));

		if (!form.valid) {
			return message(
				form,
				{ type: 'error', text: 'Please check the highlighted fields.' },
				{ status: 400 }
			);
		}

		const data = form.data;
		const trim = (value: string | null | undefined) => value?.trim() || null;
		const pick = <T>(key: string, value: T) => (key in data ? { [key]: value } : {});

		try {
			await updateVolunteerDetails(event, invite.applicationId, {
				...pick('city', trim(data.city)),
				...pick('regionId', data.regionId ?? null),
				...pick('country', trim(data.country)),
				...pick('dateOfBirth', trim(data.dateOfBirth)),
				...pick('gender', data.gender ?? null),
				...pick('occupation', trim(data.occupation)),
				...pick('organisationName', trim(data.organisationName)),
				...pick('emergencyContactName', trim(data.emergencyContactName)),
				...pick('emergencyContactPhone', trim(data.emergencyContactPhone)),
				...pick('emergencyContactRelationship', trim(data.emergencyContactRelationship)),
				...pick('skills', data.skills ?? []),
				// One per line in the textarea, one row's worth of strings here.
				...pick(
					'otherSkills',
					(data.otherSkills ?? '')
						.split('\n')
						.map((line) => line.trim())
						.filter(Boolean)
				),
				...pick('timeSlotIds', data.timeSlotIds ?? []),
				...pick('availabilityNote', trim(data.availabilityNote)),
				...pick('hoursPerWeek', data.hoursPerWeek ?? null),
				...pick('commitmentMonths', data.commitmentMonths ?? null),
				...pick('availableFrom', trim(data.availableFrom)),
				...pick('heardAbout', trim(data.heardAbout)),
				// A credentials section left filled in after the volunteer went
				// back and unticked "I am a professional" must not create a
				// credential — that would gate them behind a verification they
				// never claimed.
				...pick(
					'credentials',
					data.isProfessional
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
						: []
				),
				...pick(
					'references',
					(data.references ?? []).map((reference) => ({
						fullName: reference.fullName,
						relationship: trim(reference.relationship),
						organization: trim(reference.organization),
						email: trim(reference.email),
						phone: trim(reference.phone)
					}))
				),
				...pick('hasPriorConviction', data.hasPriorConviction ?? null),
				...pick('priorConvictionDetail', trim(data.priorConvictionDetail)),
				consentBackgroundCheck: data.consentBackgroundCheck === true,
				agreeCodeOfConduct: data.agreeCodeOfConduct === true,
				declareAccurate: data.declareAccurate === true,
				acknowledgeNoGuarantee: data.acknowledgeNoGuarantee === true
			});

			await markInviteCompleted(invite.inviteId);

			return message(form, {
				type: 'success',
				text: 'Thank you. Your application is complete.'
			});
		} catch (err) {
			console.error('Volunteer details update failed:', err);
			return message(
				form,
				{ type: 'error', text: 'We could not save your answers. Please try again.' },
				{ status: 500 }
			);
		}
	}
};
