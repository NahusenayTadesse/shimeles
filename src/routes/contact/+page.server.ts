import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { getPage } from '$lib/server/content';
import { hydrateBlocks } from '$lib/server/pageData';
import {
	createContactMessage,
	getContactCatalog,
	acknowledgeContactMessage,
	notifyNewContactMessage
} from '$lib/server/contact';
import { contactSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * `/contact` — a real route, not a `form_embed` block.
 *
 * The copy above the form is still a `pages` row with content blocks, and the
 * addresses beside it are `contact_offices` rows, so everything a staff member
 * would want to rewrite is editable. What is code is the handful of questions
 * a message needs in order to be routed and answered.
 */
export const load: PageServerLoad = async ({ url }) => {
	const [page, catalog] = await Promise.all([getPage('contact'), getContactCatalog()]);

	const blockData = page ? await hydrateBlocks(page.blocks) : null;

	// `/contact?about=press` — so a "press enquiries" link anywhere on the site
	// can open the form with the right topic already chosen.
	const requested = url.searchParams.get('about');
	const preselected = requested
		? (catalog.subjects.find((subject) => subject.slug === requested) ?? null)
		: null;

	const form = await superValidate(zod4(contactSchema), {
		defaults: {
			fullName: '',
			email: '',
			phone: '',
			organization: '',
			subjectId: preselected?.id ?? null,
			message: '',
			preferredChannel: 'either',
			joinNewsletter: false,
			website: ''
		}
	});

	return { page, blocks: blockData, catalog, form };
};

export const actions: Actions = {
	send: async (event) => {
		const form = await superValidate(event.request, zod4(contactSchema));

		if (!form.valid) {
			return message(
				form,
				{ type: 'error', text: 'Please check the highlighted fields.' },
				{ status: 400 }
			);
		}

		// The honeypot. Accepted silently and stored nowhere.
		if (form.data.website) {
			return message(form, { type: 'success', text: 'Thank you. We have your message.' });
		}

		const data = form.data;
		const trim = (value: string | null | undefined) => value?.trim() || null;

		try {
			const result = await createContactMessage(event, {
				subjectId: data.subjectId,
				fullName: data.fullName,
				email: trim(data.email),
				phone: trim(data.phone),
				organization: trim(data.organization),
				message: data.message,
				preferredChannel: data.preferredChannel,
				joinNewsletter: data.joinNewsletter
			});

			// Fire-and-forget: the message is already stored, and a slow mail
			// server must not turn a saved enquiry into an error page.
			void notifyNewContactMessage(result, data.subjectId).catch((err) =>
				console.error('contact notification failed', err)
			);
			void acknowledgeContactMessage(result, data.subjectId, trim(data.email), data.fullName).catch(
				(err) => console.error('contact acknowledgement failed', err)
			);

			return message(form, {
				type: 'success',
				text: 'Thank you. We have your message.',
				reference: result.referenceNumber
			});
		} catch (err) {
			console.error('Contact message failed:', err);
			return message(
				form,
				{ type: 'error', text: 'We could not send your message. Please try again.' },
				{ status: 500 }
			);
		}
	}
};
