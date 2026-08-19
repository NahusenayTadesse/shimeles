import { getBlogCategories, getFeaturedBlogPost, searchBlogPosts } from '$lib/server/content';
import type { PageServerLoad } from './$types';

/**
 * The public blog index.
 *
 * Filtering happens on the server so that a filtered view is a shareable,
 * indexable URL (`/blog?category=field-notes&q=kolfe`) and so the page works
 * with JavaScript off — and, more to the point, in SQL rather than in memory,
 * so the cost of a visit does not grow with the size of the archive. See
 * `searchBlogPosts`.
 */
const PER_PAGE = 9;

export const load: PageServerLoad = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	const category = url.searchParams.get('category') ?? '';
	const requestedPage = Number(url.searchParams.get('page') ?? '1');
	const isFiltered = Boolean(query || category);

	// The featured post gets its own banner above the grid, so it is excluded
	// from the grid rather than shown twice. Only on the unfiltered first page:
	// inside a filtered result the reader asked for a specific set, and
	// promoting one of them over the others is noise.
	const featured = isFiltered ? null : await getFeaturedBlogPost();

	const { posts, total, page, pageCount } = await searchBlogPosts({
		query,
		categorySlug: category,
		page: Number.isFinite(requestedPage) ? requestedPage : 1,
		perPage: PER_PAGE,
		excludeId: featured?.id ?? null
	});

	return {
		featured,
		posts,
		categories: await getBlogCategories(),
		// The banner's post is one of the results, so it counts towards the
		// total a reader is told about even though it is not in the grid.
		total: featured ? total + 1 : total,
		query,
		category,
		currentPage: page,
		pageCount
	};
};
