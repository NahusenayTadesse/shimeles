import { error } from '@sveltejs/kit';
import { getBlogPost, getRelatedBlogPosts } from '$lib/server/content';
import type { PageServerLoad } from './$types';

/**
 * One post.
 *
 * `getBlogPost` returns null for a draft or a post dated in the future as
 * well as for an unknown slug, so a scheduled post is a 404 until its date
 * arrives rather than a page anyone with the link can read early.
 */
export const load: PageServerLoad = async ({ params }) => {
	const post = await getBlogPost(params.slug);
	if (!post) throw error(404, 'That post does not exist.');

	return {
		post,
		related: await getRelatedBlogPosts(post.id, post.category?.slug ?? null)
	};
};
