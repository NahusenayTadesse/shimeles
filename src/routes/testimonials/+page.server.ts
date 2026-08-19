import { getPillars, getTestimonials } from '$lib/server/content';
import type { PageServerLoad } from './$types';

/**
 * The testimonials wall — everything flagged `show_on_site`.
 *
 * Filtering by programme happens in the browser rather than the URL: this is a
 * cached collection of at most a few dozen quotes, so there is nothing to gain
 * from a round trip, and the reader gets an instant response.
 */
export const load: PageServerLoad = async () => {
	const [testimonials, pillars] = await Promise.all([getTestimonials(), getPillars()]);

	// Only programmes that actually have a quote get a filter chip — a chip
	// leading to an empty wall is worse than no chip.
	const used = new Set(testimonials.map((t) => t.pillar?.slug).filter(Boolean));

	return {
		testimonials,
		pillars: pillars.filter((pillar) => used.has(pillar.slug))
	};
};
