import { z } from 'zod/v4';
import { flagField, optionalEmailField } from '$lib/forms/fields';

/**
 * Rendered by `/contact` as well as enforced here, which is why it is a
 * constant: the counter under the textarea and the validator have to agree,
 * and this schema imports nothing from `$lib/server`, so the page may import
 * it — same arrangement as `/apply` (see `$lib/forms/fields`).
 */
export const MAX_CONTACT_MESSAGE = 250;

/**
 * The contact form.
 *
 * Hand-written rather than generated from a `form_definitions` row. The
 * questions are few and fixed, and what a message needs from the sender is
 * decided by what staff must do with it — route it, and answer it — rather
 * than by what a form builder happens to offer.
 *
 * The topics themselves are catalogue rows loaded at request time, so the one
 * part a staff member would genuinely want to change stays editable (§0).
 */
export const contactSchema = z
	.object({
		fullName: z.string().trim().min(2, 'Enter your name').max(150),

		/**
		 * Neither is required on its own, but one of them must be there — see
		 * the refinement below. A message we cannot answer is not a message.
		 */
		email: optionalEmailField(),
		phone: z.string().trim().max(32).optional().or(z.literal('')),

		organization: z.string().trim().max(150).optional().or(z.literal('')),

		/** Null is allowed: "something else" is a real answer, not a validation failure. */
		subjectId: z.coerce.number().int().positive().nullable().default(null),

		message: z
			.string()
			.trim()
			.min(10, 'Tell us a little more')
			/**
			 * Deliberately short. This is a routing form, not the place someone
			 * tells their story — `/apply` is, and it allows 5000. A message that
			 * needs more than a couple of sentences is a case, and staff answer it
			 * by replying, not by reading it here.
			 */
			.max(
				MAX_CONTACT_MESSAGE,
				`Keep this under ${MAX_CONTACT_MESSAGE} characters — we will follow up by email`
			),

		preferredChannel: z.enum(['email', 'phone', 'either']).default('either'),

		/** Opt-in, checked before anyone is added to the newsletter. */
		joinNewsletter: flagField(false),

		/**
		 * Honeypot. Deliberately permissive rather than `max(0)`: failing
		 * validation would hand a bot "please check the highlighted fields",
		 * which teaches it which field to leave alone next time. The action
		 * accepts it and stores nothing.
		 */
		website: z.string().max(200).optional().or(z.literal(''))
	})
	.refine((data) => Boolean(data.email?.trim()) || Boolean(data.phone?.trim()), {
		path: ['email'],
		message: 'Give us either an email address or a phone number so we can reply'
	})
	/** Asking to be phoned back without leaving a number is a dead end. */
	.refine((data) => data.preferredChannel !== 'phone' || Boolean(data.phone?.trim()), {
		path: ['phone'],
		message: 'Add a phone number, or ask us to reply by email'
	})
	.refine((data) => data.preferredChannel !== 'email' || Boolean(data.email?.trim()), {
		path: ['email'],
		message: 'Add an email address, or ask us to reply by phone'
	});

export type ContactSchema = typeof contactSchema;
