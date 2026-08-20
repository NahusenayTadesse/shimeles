import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { getPage } from '$lib/server/content';
import { hydrateBlocks } from '$lib/server/pageData';
import { getVolunteerCatalog, createVolunteerApplication } from '$lib/server/volunteers';
import { notifyNewVolunteer } from '$lib/server/notify';
import { sendEmail, volunteerAcknowledgementTemplate } from '$lib/server/email';
import { volunteerSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * `/volunteer` — a real route, not a `form_embed` block.
 *
 * Volunteering is a core workflow rather than a page of copy with a
 * questionnaire on it. The intake feeds `volunteer_applications` and its
 * catalogue joins, and the safeguarding gate in `setVolunteerStatus` reads
 * those columns, so the shape of this form is load-bearing in a way a dynamic
 * form definition cannot safely be.
 *
 * The copy above the form is still a `pages` row with content blocks, so
 * everything a staff member would want to rewrite is editable. What is fixed
 * is only the set of questions the workflow depends on (§0 draws the line at
 * "would a non-technical staff member want to change this?" — they would want
 * to change the words, not delete the reference checks).
 */
export const load: PageServerLoad = async () => {
	const [page, catalog] = await Promise.all([getPage('volunteer'), getVolunteerCatalog()]);

	const blockData = page ? await hydrateBlocks(page.blocks) : null;

	const form = await superValidate(zod4(volunteerSchema), {
		defaults: {
			fullName: '',
			email: '',
			phone: '',
			city: '',
			regionId: catalog.regions.find((region) => region.isDefault)?.id ?? null,
			dateOfBirth: '',
			gender: null,
			occupation: '',
			emergencyContactName: '',
			emergencyContactPhone: '',
			emergencyContactRelationship: '',
			pillarIds: [],
			skills: [],
			otherSkills: '',
			timeSlotIds: [],
			availabilityNote: '',
			hoursPerWeek: null,
			commitmentMonths: null,
			availableFrom: '',
			motivation: '',
			heardAbout: '',
			isProfessional: false,
			credentials: [],
			// Two reference blocks are rendered from the start rather than added
			// by a button, because two is the requirement and an empty section
			// reads as optional.
			references: [
				{ fullName: '', relationship: '', organization: '', email: '', phone: '' },
				{ fullName: '', relationship: '', organization: '', email: '', phone: '' }
			],
			hasPriorConviction: null,
			priorConvictionDetail: '',
			consentBackgroundCheck: false,
			agreeCodeOfConduct: false,
			website: ''
		}
	});

	return { page, blocks: blockData, catalog, form };
};

export const actions: Actions = {
	apply: async (event) => {
		const form = await superValidate(event.request, zod4(volunteerSchema));

		if (!form.valid) {
			return message(
				form,
				{ type: 'error', text: 'Please check the highlighted fields.' },
				{ status: 400 }
			);
		}

		// The honeypot. A bot filled a field no person can see, so the request is
		// accepted silently and stored nowhere — telling a spammer they were
		// caught only teaches them to avoid the trap next time.
		if (form.data.website) {
			return message(form, { type: 'success', text: 'Thank you.' });
		}

		const data = form.data;
		const trim = (value: string | null | undefined) => value?.trim() || null;

		try {
			const result = await createVolunteerApplication(event, {
				fullName: data.fullName,
				email: data.email.trim().toLowerCase(),
				phone: data.phone,
				city: trim(data.city),
				regionId: data.regionId,
				dateOfBirth: trim(data.dateOfBirth),
				gender: data.gender,
				occupation: trim(data.occupation),
				emergencyContactName: data.emergencyContactName,
				emergencyContactPhone: data.emergencyContactPhone,
				emergencyContactRelationship: trim(data.emergencyContactRelationship),
				pillarIds: data.pillarIds,
				skills: data.skills,
				// One per line in the textarea, one row's worth of strings here.
				otherSkills: (data.otherSkills ?? '')
					.split('\n')
					.map((line) => line.trim())
					.filter(Boolean),
				timeSlotIds: data.timeSlotIds,
				availabilityNote: trim(data.availabilityNote),
				hoursPerWeek: data.hoursPerWeek,
				commitmentMonths: data.commitmentMonths,
				availableFrom: trim(data.availableFrom),
				motivation: data.motivation,
				heardAbout: trim(data.heardAbout),
				// A credentials section left filled in after the applicant went
				// back and answered "no" must not create a credential — that would
				// gate them behind a verification they never claimed.
				credentials: data.isProfessional
					? data.credentials.map((credential) => ({
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
				references: data.references.map((reference) => ({
					fullName: reference.fullName,
					relationship: trim(reference.relationship),
					organization: trim(reference.organization),
					email: trim(reference.email),
					phone: trim(reference.phone)
				})),
				hasPriorConviction: data.hasPriorConviction,
				priorConvictionDetail: trim(data.priorConvictionDetail),
				consentBackgroundCheck: data.consentBackgroundCheck,
				agreeCodeOfConduct: data.agreeCodeOfConduct
			});

			// Both fire-and-forget: the application is already stored, and a slow
			// mail server must not turn a saved application into an error page.
			const mail = volunteerAcknowledgementTemplate(data.fullName, result.referenceNumber);
			void sendEmail(data.email, mail.subject, mail.html).catch((err) =>
				console.error('volunteer acknowledgement failed', err)
			);
			void notifyNewVolunteer(result).catch((err) =>
				console.error('volunteer notification failed', err)
			);

			return message(form, {
				type: 'success',
				text: 'Thank you. We have your application.',
				reference: result.referenceNumber
			});
		} catch (err) {
			console.error('Volunteer application failed:', err);
			return message(
				form,
				{ type: 'error', text: 'We could not save your application. Please try again.' },
				{ status: 500 }
			);
		}
	}
};
