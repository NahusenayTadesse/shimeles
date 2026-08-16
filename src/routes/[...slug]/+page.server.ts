import { error } from '@sveltejs/kit';
import { loadPageData } from '$lib/server/pageData';
import { handleFormSubmission } from '$lib/server/formSubmit';
import type { Actions, PageServerLoad } from './$types';

/**
 * The catch-all public page route.
 *
 * Every page the Foundation publishes — About Us, Mission & Vision, Programs,
 * anything a staff member adds next year — is a `pages` row rendered here.
 * There is no per-page route file, which is what makes "add a page" a
 * dashboard action rather than a deploy (§0).
 */
export const load: PageServerLoad = async ({ params }) => {
	const slug = params.slug;

	// `/home` would be a second URL for `/`, which splits the SEO and confuses
	// the nav's active state. One canonical address per page.
	if (!slug || slug === 'home' || slug.includes('/')) throw error(404, 'Not found');

	return loadPageData(slug);
};

export const actions: Actions = {
	/**
	 * Submits whichever `form_embed` block posted — Contact and Volunteer
	 * render their forms inline rather than sending someone to `/forms/[slug]`
	 * (that route still exists, e.g. for shared links), so the slug travels as
	 * a query param rather than a route param: `?/submit&slug=contact-form`.
	 */
	submit: async (event) => {
		const slug = event.url.searchParams.get('slug');
		if (!slug) throw error(400, 'Missing form slug.');

		const body = await event.request.formData();
		const result = await handleFormSubmission(event, slug, body);
		if (!result) throw error(404, 'That form is not available.');
		return result;
	}
};
