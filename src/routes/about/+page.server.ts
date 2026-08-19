import {
	getAboutContent,
	getAboutGallery,
	getInitiatives,
	getOwnerMedia
} from '$lib/server/content';
import type { PageServerLoad } from './$types';

/**
 * About is the one public page that is not `content_blocks` — see the note
 * at the top of `schema.ts`. This `load` is the only place that touches the
 * database for it; the route itself is fixed markup around these four reads.
 */
export const load: PageServerLoad = async () => {
	const [content, gallery, initiatives, media] = await Promise.all([
		getAboutContent(),
		getAboutGallery(),
		getInitiatives(),
		// The gallery above is the In Memoriam set; this is the page's video.
		getOwnerMedia('about', 1)
	]);

	return { content, gallery, initiatives, videos: media.videos };
};
