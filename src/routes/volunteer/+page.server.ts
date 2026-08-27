import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { getPage } from '$lib/server/content';
import { hydrateBlocks } from '$lib/server/pageData';
import { getVolunteerPillars, createVolunteerApplication } from '$lib/server/volunteers';
import { notifyNewVolunteer } from '$lib/server/notify';
import { sendEmail, volunteerAcknowledgementTemplate } from '$lib/server/email';
import { intakeSchema } from './schema';
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
 * What this page asks is deliberately small: a name, a phone number, an email,
 * a few words about why, and which programmes. Somebody here is saying "I would
 * like to help", and the emergency contact, the two references and the
 * safeguarding declarations are questions for after a coordinator has spoken to
 * them — asked on the volunteer's file or through a link staff send. Nothing was
 * removed from the record; only from this first step.
 *
 * The row this writes is therefore sparse, and correctly so. The approval gate
 * reads `safeguarding_checklist_complete` and `credentials_verified`, both of
 * which start false for everyone, so a half-filled application cannot travel
 * any further than the queue on its own.
 *
 * The copy above the form is still a `pages` row with content blocks, so
 * everything a staff member would want to rewrite is editable. What is fixed
 * is only the set of questions the workflow depends on (§0 draws the line at
 * "would a non-technical staff member want to change this?" — they would want
 * to change the words, not delete the reference checks).
 */
export const load: PageServerLoad = async () => {
	const [page, pillars] = await Promise.all([getPage('volunteer'), getVolunteerPillars()]);

	const blockData = page ? await hydrateBlocks(page.blocks) : null;

	const form = await superValidate(zod4(intakeSchema), {
		defaults: {
			fullName: '',
			email: '',
			phone: '',
			motivation: '',
			pillarIds: [],
			website: ''
		}
	});

	return { page, blocks: blockData, pillars, form };
};

export const actions: Actions = {
	apply: async (event) => {
		const form = await superValidate(event.request, zod4(intakeSchema));

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

		try {
			// Everything the intake does not ask for is written as absent rather
			// than as an empty answer: no time slots, no references, no
			// declarations. The consent timestamps in particular stay null,
			// because they record *when this person agreed* and nobody has yet
			// shown them anything to agree to.
			const result = await createVolunteerApplication(event, {
				fullName: data.fullName,
				email: data.email.trim().toLowerCase(),
				phone: data.phone,
				motivation: data.motivation,
				pillarIds: data.pillarIds,
				city: null,
				// Null, so `createVolunteerApplication` files them under the
				// default region until somebody knows better.
				regionId: null,
				country: null,
				dateOfBirth: null,
				gender: null,
				occupation: null,
				organisationName: null,
				emergencyContactName: null,
				emergencyContactPhone: null,
				emergencyContactRelationship: null,
				skills: [],
				otherSkills: [],
				timeSlotIds: [],
				availabilityNote: null,
				hoursPerWeek: null,
				commitmentMonths: null,
				availableFrom: null,
				heardAbout: null,
				credentials: [],
				references: [],
				hasPriorConviction: null,
				priorConvictionDetail: null,
				consentBackgroundCheck: false,
				agreeCodeOfConduct: false,
				declareAccurate: false,
				acknowledgeNoGuarantee: false
			});

			// Both fire-and-forget: the application is already stored, and a slow
			// mail server must not turn a saved application into an error page.
			const mail = volunteerAcknowledgementTemplate(data.fullName, result.referenceNumber);
			void sendEmail({ to: data.email, ...mail }).catch((err) =>
				console.error('volunteer acknowledgement failed', err)
			);
			void notifyNewVolunteer(result).catch((err) =>
				console.error('volunteer notification failed', err)
			);

			return message(form, {
				type: 'success',
				text: 'Thank you for applying. We will contact you shortly.',
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
