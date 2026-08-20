import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * `/apply/[pillar]` used to redirect to the programme page, because the only
 * application form lived embedded there. `/apply` is now a real page that
 * takes the programme as a parameter, so this sends people to it with that
 * programme already chosen rather than bouncing them to a page of copy.
 *
 * Kept as a redirect rather than deleted: the URL has been shared.
 */
export const load: PageServerLoad = async ({ params }) => {
	throw redirect(308, `/apply?for=${encodeURIComponent(params.pillar)}`);
};
