import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { RequestEvent } from '@sveltejs/kit';
import { buildSchema, formStatusContext, loadForm, normaliseFormData } from '$lib/server/forms';
import { submitForm } from '$lib/server/submissions';
import { submitVolunteerApplication } from '$lib/server/volunteers';
import { acknowledgeSubmission, notifyNewSubmission, notifyNewVolunteer } from '$lib/server/notify';

/**
 * Validates and stores one public form submission — shared by the standalone
 * `/forms/[slug]` route and any `form_embed` block rendered inline on its own
 * page (Contact, Volunteer), so the two never drift apart.
 *
 * `body` is a `FormData` rather than the raw request so a page with more than
 * one action can read which form was posted (the slug) before this ever
 * touches Superforms — `event.request` can only be consumed once.
 */
export async function handleFormSubmission(
	event: RequestEvent,
	slug: string,
	body: FormData | Request
) {
	const definition = await loadForm(slug);
	if (!definition) return null;

	// Read once, then correct the wire format before validating: repeated
	// checkbox fields, a legacy comma-joined selection and an option retired
	// since the page was rendered all become one clean array here. See
	// `normaliseFormData` — the multiselect schema deliberately cannot do this
	// itself.
	const posted = body instanceof FormData ? body : await body.formData();
	const form = await superValidate(
		normaliseFormData(definition, posted),
		zod4(buildSchema(definition))
	);

	if (!form.valid) {
		return message(
			form,
			{ type: 'error', text: 'Please check the highlighted fields.' },
			{ status: 400 }
		);
	}

	// The honeypot. A bot filled a field no person can see, so the request is
	// accepted silently and discarded — telling a spammer they were caught
	// only teaches them to avoid the trap next time.
	if (form.data.website) {
		return message(form, {
			type: 'success',
			text: 'Thank you.',
			reference: 'SAF-000-0000-0000'
		});
	}

	try {
		// The volunteer form lands in `volunteer_applications` rather than
		// `form_submissions` — §3.6 gives that workflow first-class columns
		// because safeguarding state has to be queryable, not buried in JSON.
		const context = await formStatusContext(definition.slug);
		const payload = form.data as Record<string, unknown>;
		const result =
			context === 'volunteer'
				? await submitVolunteerApplication(event, definition, payload)
				: await submitForm(event, definition, payload);

		// Fire-and-forget: a mail server being slow must not make the applicant
		// wait, and must not fail a submission that is already safely stored.
		//
		// The notification has to follow the same branch as the write. A volunteer
		// application's id is a `volunteer_applications` id, and
		// `notifyNewSubmission` builds a `/dashboard/applications/…` link — so
		// sending both down that path pointed staff at whichever unrelated case
		// happened to share the number.
		const notify =
			context === 'volunteer'
				? notifyNewVolunteer(result)
				: notifyNewSubmission(definition.slug, result);

		void notify.catch((err) => console.error('submission notification failed', err));

		/**
		 * And the person who filled it in.
		 *
		 * Here rather than in each route, so every dynamic form gets it: the four
		 * programme applications rendered on `/programs/[slug]`, anything reached
		 * at `/forms/[slug]`, and any `form_embed` block. A fifth programme added
		 * from the dashboard tomorrow acknowledges its applicants with no code
		 * change, which is the whole point of the form engine.
		 *
		 * `/apply`, `/volunteer` and `/contact` do not come through here — they
		 * have their own submit paths and their own, more specific wording — so
		 * there is no double send.
		 */
		void acknowledgeSubmission(definition, result).catch((err) =>
			console.error('submission acknowledgement failed', err)
		);

		return message(form, {
			type: 'success',
			text: 'We have received your request.',
			reference: result.referenceNumber
		});
	} catch (err) {
		console.error('Form submission failed:', err);
		return message(
			form,
			{ type: 'error', text: 'We could not save your request. Please try again.' },
			{ status: 500 }
		);
	}
}
