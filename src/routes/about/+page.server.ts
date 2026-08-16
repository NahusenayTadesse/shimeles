import { getAboutContent, getAboutGallery, getInitiatives } from '$lib/server/content';
import type { PageServerLoad } from './$types';

/**
 * About is the one public page that is not `content_blocks` — see the note
 * at the top of `schema.ts`. This `load` is the only place that touches the
 * database for it; the route itself is fixed markup around these three reads.
 */
export const load: PageServerLoad = async () => {
	const [content, gallery, initiatives] = await Promise.all([
		getAboutContent(),
		getAboutGallery(),
		getInitiatives()
	]);

	return { content, gallery, initiatives };
};
