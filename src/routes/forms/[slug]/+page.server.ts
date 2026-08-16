import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { buildSchema, loadForm } from '$lib/server/forms';
import { handleFormSubmission } from '$lib/server/formSubmit';
import type { Actions, PageServerLoad } from './$types';

/**
 * The single public form route.
 *
 * All four assistance applications, the volunteer form and the contact form
 * live here. Per §3.3 there is one Superforms + Zod schema *generator* rather
 * than six hand-written forms — the schema is built at request time from the
 * `form_definitions` row and its `form_fields`, so a question added in the
 * dashboard is validated and stored without a deploy.
 */
export const load: PageServerLoad = async ({ params }) => {
	const form = await loadForm(params.slug);
	if (!form) throw error(404, 'That form is not available.');

	return {
		definition: form,
		form: await superValidate(zod4(buildSchema(form)))
	};
};

export const actions: Actions = {
	submit: async (event) => {
		// Reloaded rather than carried from `load`: the definition may have
		// changed between the page render and the post, and the schema that
		// validates must be the one the database currently describes.
		const result = await handleFormSubmission(event, event.params.slug, event.request);
		if (!result) throw error(404, 'That form is not available.');
		return result;
	}
};
