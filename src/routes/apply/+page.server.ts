import { message, superValidate, withFiles } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { getPage } from '$lib/server/content';
import { hydrateBlocks } from '$lib/server/pageData';
import { createApplication, getApplyCatalog } from '$lib/server/apply';
import { notifyNewSubmission } from '$lib/server/notify';
import { sendEmail, applicantAcknowledgementTemplate } from '$lib/server/email';
import { applySchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * `/apply` — one front door for assistance, whatever the need.
 *
 * Previously `/apply/[pillar]` was a redirect to the programme page, and the
 * only way in was the form embedded there, which meant an applicant had to
 * work out which of four programmes their problem belonged to before they
 * could ask for help. Here the programme is optional and is inferred from what
 * they say they need.
 *
 * The page copy above the form is still a `pages` row with content blocks, and
 * the needs list and languages are catalogue rows, so everything a staff
 * member would want to change stays editable (§0).
 */
export const load: PageServerLoad = async ({ url }) => {
	const [page, catalog] = await Promise.all([getPage('apply'), getApplyCatalog()]);

	const blockData = page ? await hydrateBlocks(page.blocks) : null;

	// `/apply?for=medical-hardship` — so the "Apply for support" button on a
	// programme page opens this with that programme already chosen.
	const requested = url.searchParams.get('for');
	const preselected = requested
		? (catalog.pillars.find((pillar) => pillar.slug === requested) ?? null)
		: null;

	const form = await superValidate(zod4(applySchema), {
		defaults: {
			pillarId: preselected?.id ?? null,
			needs: [],
			story: '',
			writtenLanguageId: catalog.languages[0]?.id ?? null,
			applyingFor: 'self',
			relationship: '',
			applicantName: '',
			applicantPhone: '',
			applicantEmail: '',
			subjectName: '',
			subjectDateOfBirth: '',
			subjectApproximateAge: null,
			subjectGender: 'undisclosed',
			subjectPhone: '',
			city: '',
			addressLine: '',
			regionId: catalog.regions.find((region) => region.isDefault)?.id ?? null,
			householdSize: null,
			dependantsCount: null,
			monthlyIncome: null,
			incomeSource: '',
			isEmployed: null,
			hasDisability: null,
			healthDetail: '',
			otherSupport: '',
			safeToContact: true,
			contactNotes: '',
			bestTimeToContact: '',
			alternateContactName: '',
			alternateContactPhone: '',
			consentToStore: false,
			consentToVerify: false,
			website: ''
		}
	});

	return { page, blocks: blockData, catalog, form, preselectedPillarId: preselected?.id ?? null };
};

export const actions: Actions = {
	apply: async (event) => {
		// Read once: the documents come off the same body as the fields, and
		// `event.request` can only be consumed one time.
		const body = await event.request.formData();
		const form = await superValidate(body, zod4(applySchema));

		if (!form.valid) {
			return message(
				form,
				{ type: 'error', text: 'Please check the highlighted fields.' },
				{ status: 400 }
			);
		}

		// The honeypot. Accepted silently and stored nowhere.
		if (form.data.website) {
			return message(form, { type: 'success', text: 'Thank you. We have your application.' });
		}

		const data = form.data;
		const trim = (value: string | null | undefined) => value?.trim() || null;

		// Superforms does not carry a repeated file input through the schema, so
		// the uploads are read straight off the body.
		const documents = body
			.getAll('documents')
			.filter((entry): entry is File => entry instanceof File && entry.size > 0)
			.slice(0, 6);

		try {
			const result = await createApplication(event, {
				pillarId: data.pillarId,
				applyingFor: data.applyingFor,
				relationship: trim(data.relationship),
				applicantName: data.applicantName,
				applicantPhone: trim(data.applicantPhone),
				applicantEmail: trim(data.applicantEmail)?.toLowerCase() ?? null,
				subjectName: trim(data.subjectName),
				subjectDateOfBirth: trim(data.subjectDateOfBirth),
				subjectApproximateAge: data.subjectApproximateAge,
				subjectGender: data.subjectGender,
				subjectPhone: trim(data.subjectPhone),
				city: trim(data.city),
				addressLine: trim(data.addressLine),
				regionId: data.regionId,
				householdSize: data.householdSize,
				dependantsCount: data.dependantsCount,
				monthlyIncome: data.monthlyIncome,
				incomeSource: trim(data.incomeSource),
				isEmployed: data.isEmployed,
				hasDisability: data.hasDisability,
				healthDetail: trim(data.healthDetail),
				otherSupport: trim(data.otherSupport),
				safeToContact: data.safeToContact,
				contactNotes: trim(data.contactNotes),
				bestTimeToContact: trim(data.bestTimeToContact),
				alternateContactName: trim(data.alternateContactName),
				alternateContactPhone: trim(data.alternateContactPhone),
				writtenLanguageId: data.writtenLanguageId,
				story: data.story,
				needs: data.needs.map((need) => ({
					needId: need.needId,
					detail: trim(need.detail),
					estimatedAmount: need.estimatedAmount,
					urgency: need.urgency
				})),
				consentToVerify: data.consentToVerify,
				consentToStore: data.consentToStore,
				documents
			});

			// Both fire-and-forget: the application is stored, and a slow mail
			// server must not turn it into an error page for someone who has just
			// asked for help.
			const email = trim(data.applicantEmail);
			if (email) {
				const mail = applicantAcknowledgementTemplate(data.applicantName, result.referenceNumber);
				void sendEmail(email, mail.subject, mail.html).catch((err) =>
					console.error('application acknowledgement failed', err)
				);
			}
			// Routed to whoever is listed on the form definition this landed
			// against, which is the pillar's team when a pillar was resolved.
			void notifyNewSubmission(result.definitionSlug, result).catch((err) =>
				console.error('application notification failed', err)
			);

			return message(withFiles(form), {
				type: 'success',
				text: 'Thank you. We have your application.',
				reference: result.referenceNumber
			});
		} catch (err) {
			console.error('Application failed:', err);
			return message(
				withFiles(form),
				{ type: 'error', text: 'We could not save your application. Please try again.' },
				{ status: 500 }
			);
		}
	}
};
