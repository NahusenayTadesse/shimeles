import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * `/apply/[pillar]` never had a page behind it — every "Apply for support"
 * link now points straight at `/programs/[slug]#apply`, where the form
 * actually lives inline. This route stays only so that URL keeps working
 * for anyone who already bookmarked or shared it.
 */
export const load: PageServerLoad = async ({ params }) => {
	throw redirect(308, `/programs/${params.pillar}#apply`);
};
