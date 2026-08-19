import {
	and,
	asc,
	count,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	lte,
	ne,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	aboutContent,
	blogCategories,
	blogPosts,
	mediaItems,
	testimonials,
	contentBlocks,
	donationCampaigns,
	futureInitiatives,
	navigationItems,
	pages,
	pillars,
	regions,
	paymentAccounts,
	paymentMethods
} from '$lib/server/db/schema';
import { cached, invalidate } from '$lib/server/cache';
import { paypalTarget } from '$lib/donations';
import { isUsableYouTubeUrl } from '$lib/youtube';
import type { MediaOwner } from '$lib/server/db/schema';
import type {
	RenderBlock,
	RenderBlogCategory,
	RenderBlogPost,
	RenderBlogPostDetail,
	RenderDonationCampaign,
	RenderNavItem,
	RenderPage,
	RenderPillar,
	RenderTestimonial
} from '$lib/content/types';

/**
 * Public-site content queries.
 *
 * Everything the public site renders comes through this module, so no
 * `.svelte` file ever contains the title, the nav label or the body copy.
 *
 * v1 is English-only. The `*_am` columns stay in the schema and keep their
 * seeded values; nothing reads them, so restoring Amharic later is a change to
 * these selects rather than a migration.
 *
 * Reads are cached (see `$lib/server/cache`) because these collections are hit
 * on every page load and written a handful of times a month; each dashboard
 * write drops the relevant key.
 */

/* ==========================================================================
   Navigation
   ========================================================================== */

export async function getNavigation(): Promise<{
	header: RenderNavItem[];
	footer: RenderNavItem[];
}> {
	const rows = await cached('nav', () =>
		db
			.select({
				id: navigationItems.id,
				label: navigationItems.label,
				url: navigationItems.url,
				placement: navigationItems.placement,
				parentId: navigationItems.parentId,
				isCta: navigationItems.isCta,
				sortOrder: navigationItems.sortOrder,
				pageSlug: pages.slug,
				pagePublished: pages.isPublished
			})
			.from(navigationItems)
			.leftJoin(pages, eq(pages.id, navigationItems.pageId))
			.where(
				and(
					eq(navigationItems.isVisible, true),
					eq(navigationItems.isActive, true),
					isNull(navigationItems.deletedAt)
				)
			)
			.orderBy(asc(navigationItems.sortOrder), asc(navigationItems.id))
	);

	// A nav item pointing at an unpublished page would 404 the visitor, so it is
	// dropped here rather than rendered and hoped for.
	const usable = rows.filter((row) => (row.pageSlug ? row.pagePublished : Boolean(row.url)));

	const toItem = (row: (typeof usable)[number]): RenderNavItem => ({
		id: row.id,
		label: row.label,
		href: row.pageSlug ? (row.pageSlug === 'home' ? '/' : `/${row.pageSlug}`) : (row.url ?? '#'),
		isCta: row.isCta,
		children: usable
			.filter((child) => child.parentId === row.id)
			.map((child) => ({
				id: child.id,
				label: child.label,
				href: child.pageSlug
					? child.pageSlug === 'home'
						? '/'
						: `/${child.pageSlug}`
					: (child.url ?? '#'),
				isCta: child.isCta,
				children: []
			}))
	});

	const topLevel = usable.filter((row) => row.parentId == null);

	return {
		header: topLevel.filter((r) => r.placement !== 'footer').map(toItem),
		footer: topLevel.filter((r) => r.placement !== 'header').map(toItem)
	};
}

/* ==========================================================================
   Pages & blocks
   ========================================================================== */

/**
 * A published page with its blocks in order.
 *
 * Returns `null` for an unknown or unpublished slug, so the route can 404 —
 * previewing an unpublished page is a dashboard concern, not a public one.
 */
export async function getPage(slug: string): Promise<RenderPage | null> {
	const raw = await cached(`page:${slug}`, async () => {
		const [page] = await db
			.select()
			.from(pages)
			.where(and(eq(pages.slug, slug), eq(pages.isPublished, true), isNull(pages.deletedAt)))
			.limit(1);

		if (!page) return null;

		const blocks = await db
			.select()
			.from(contentBlocks)
			.where(
				and(
					eq(contentBlocks.pageId, page.id),
					eq(contentBlocks.isPublished, true),
					isNull(contentBlocks.deletedAt)
				)
			)
			.orderBy(asc(contentBlocks.sortOrder), asc(contentBlocks.id));

		return { page, blocks };
	});

	if (!raw) return null;

	// Only the block types that render media pay for the lookup.
	const mediaBlockIds = raw.blocks
		.filter((block) => block.blockType === 'gallery' || block.blockType === 'video')
		.map((block) => block.id);
	const media = await getMediaByOwner('content_block', mediaBlockIds);

	return {
		id: raw.page.id,
		slug: raw.page.slug,
		title: raw.page.title,
		metaDescription: raw.page.metaDescription,
		shareImage: raw.page.shareImage,
		blocks: raw.blocks.map((block): RenderBlock => ({
			id: block.id,
			type: block.blockType,
			heading: block.heading,
			content: (block.content ?? {}) as Record<string, unknown>,
			media: media[block.id]
		}))
	};
}

/** Every published page slug, for the sitemap and the dashboard page picker. */
export const listPages = () =>
	cached('pages:list', () =>
		db
			.select({
				id: pages.id,
				slug: pages.slug,
				title: pages.title,
				isPublished: pages.isPublished
			})
			.from(pages)
			.where(isNull(pages.deletedAt))
			.orderBy(asc(pages.sortOrder), asc(pages.id))
	);

/* ==========================================================================
   Pillars & initiatives
   ========================================================================== */

export async function getPillars(): Promise<RenderPillar[]> {
	const rows = await cached('pillars', () =>
		db
			.select()
			.from(pillars)
			.where(and(eq(pillars.isActive, true), isNull(pillars.deletedAt)))
			.orderBy(asc(pillars.sortOrder), asc(pillars.id))
	);

	return rows.map((row) => ({
		id: row.id,
		slug: row.slug,
		name: row.name,
		summary: row.summary,
		description: row.description,
		icon: row.icon,
		color: row.color,
		image: row.image,
		hasPublicApplication: row.hasPublicApplication
	}));
}

export async function getPillar(slug: string): Promise<RenderPillar | null> {
	const all = await getPillars();
	return all.find((pillar) => pillar.slug === slug) ?? null;
}

export async function getInitiatives() {
	const rows = await cached('initiatives', () =>
		db
			.select()
			.from(futureInitiatives)
			.where(and(eq(futureInitiatives.isActive, true), isNull(futureInitiatives.deletedAt)))
			.orderBy(asc(futureInitiatives.sortOrder), asc(futureInitiatives.id))
	);

	return rows.map((row) => ({
		id: row.id,
		slug: row.slug,
		name: row.name,
		description: row.description,
		icon: row.icon,
		image: row.image,
		status: row.status,
		goalAmount: row.goalAmount,
		currency: row.currency
	}));
}

/* ==========================================================================
   About page

   The one public page that is a hand-built route rather than
   `content_blocks` — see the note at the top of `schema.ts`. Still two cached
   reads, same as everything else here, so the dashboard can rewrite a
   paragraph without a deploy.
   ========================================================================== */

export async function getAboutContent() {
	const [row] = await cached('about', () => db.select().from(aboutContent).limit(1));
	return row ?? null;
}

/**
 * One owner's media, as the public components take it.
 *
 * `storagePath` rather than `url` because `Gallery` and `hero-collage` were
 * written against the old gallery tables' shape and there is no reason to
 * churn them; the column is simply selected under the name they expect.
 */
function mediaFor(ownerType: MediaOwner, ownerId: number, kind: 'image' | 'video') {
	return db
		.select({
			id: mediaItems.id,
			storagePath: mediaItems.url,
			url: mediaItems.url,
			caption: mediaItems.caption
		})
		.from(mediaItems)
		.where(
			and(
				eq(mediaItems.ownerType, ownerType),
				eq(mediaItems.ownerId, ownerId),
				eq(mediaItems.kind, kind)
			)
		)
		.orderBy(asc(mediaItems.sortOrder), asc(mediaItems.id));
}

export async function getAboutGallery() {
	return cached('about-gallery', () => mediaFor('about', 1, 'image'));
}

/**
 * The homepage hero's photo set. Ordered, captioned, and — unlike the old
 * `hero.image` setting — allowed to hold any number of photos, so the header
 * can rotate through a small collage instead of a single fixed banner.
 */
export async function getHeroGallery() {
	return cached('hero-gallery', () => mediaFor('hero', 0, 'image'));
}

/**
 * The general photo section further down the homepage — moments from the
 * programmes, separate from the hero collage.
 */
export async function getHomepageGallery() {
	return cached('homepage-gallery', () => mediaFor('homepage', 0, 'image'));
}

/* ==========================================================================
   Regions & payment details
   ========================================================================== */

export async function getRegions() {
	const rows = await cached('regions', () =>
		db
			.select()
			.from(regions)
			.where(and(eq(regions.isActive, true), isNull(regions.deletedAt)))
			.orderBy(asc(regions.sortOrder), asc(regions.id))
	);

	return rows.map((row) => ({
		id: row.id,
		slug: row.slug,
		name: row.name,
		isDefault: row.isDefault
	}));
}

/** The bank and wallet details shown on the Donate page, grouped by method. */
export async function getPaymentOptions() {
	const rows = await cached('payment-options', () =>
		db
			.select({
				accountId: paymentAccounts.id,
				accountName: paymentAccounts.accountName,
				accountNumber: paymentAccounts.accountNumber,
				bankName: paymentAccounts.bankName,
				branch: paymentAccounts.branch,
				swiftCode: paymentAccounts.swiftCode,
				currency: paymentAccounts.currency,
				isForDiaspora: paymentAccounts.isForDiaspora,
				accountInstructions: paymentAccounts.instructions,
				methodId: paymentMethods.id,
				methodSlug: paymentMethods.slug,
				methodName: paymentMethods.name,
				methodKind: paymentMethods.kind,
				methodLogo: paymentMethods.logo,
				methodInstructions: paymentMethods.instructions,
				methodSort: paymentMethods.sortOrder,
				accountSort: paymentAccounts.sortOrder
			})
			.from(paymentAccounts)
			.innerJoin(paymentMethods, eq(paymentMethods.id, paymentAccounts.paymentMethodId))
			.where(
				and(
					eq(paymentAccounts.isActive, true),
					isNull(paymentAccounts.deletedAt),
					eq(paymentMethods.isActive, true),
					isNull(paymentMethods.deletedAt)
				)
			)
			.orderBy(asc(paymentMethods.sortOrder), asc(paymentAccounts.sortOrder))
	);

	return rows.map((row) => ({
		accountId: row.accountId,
		accountName: row.accountName,
		accountNumber: row.accountNumber,
		bankName: row.bankName,
		branch: row.branch,
		swiftCode: row.swiftCode,
		currency: row.currency,
		isForDiaspora: row.isForDiaspora,
		methodId: row.methodId,
		methodSlug: row.methodSlug,
		methodName: row.methodName,
		methodKind: row.methodKind,
		methodLogo: row.methodLogo,
		instructions: row.accountInstructions ?? row.methodInstructions
	}));
}

/**
 * The external giving platforms shown on the Donate page.
 *
 * Featured options come first so a Foundation pushing one platform this
 * quarter can say so from the dashboard rather than through a code change.
 */
export async function getDonationCampaigns(): Promise<RenderDonationCampaign[]> {
	const rows = await cached('donation-campaigns', () =>
		db
			.select()
			.from(donationCampaigns)
			.where(and(eq(donationCampaigns.isActive, true), isNull(donationCampaigns.deletedAt)))
			.orderBy(
				desc(donationCampaigns.isFeatured),
				asc(donationCampaigns.sortOrder),
				asc(donationCampaigns.id)
			)
	);

	return rows.map((row) => ({
		id: row.id,
		slug: row.slug,
		name: row.name,
		description: row.description,
		companyName: row.companyName,
		companyLogo: row.companyLogo,
		url: row.url,
		audience: row.audience,
		currency: row.currency,
		buttonLabel: row.buttonLabel,
		note: row.note,
		isFeatured: row.isFeatured,
		// Parsed here rather than stored, so the pasted link stays the single
		// source of truth — see `$lib/donations`.
		paypal: row.isPaypal ? paypalTarget(row.url) : null
	}));
}

/* ==========================================================================
   Blog
   ========================================================================== */

/** The categories the `/blog` filter chips are built from. */
export async function getBlogCategories(): Promise<RenderBlogCategory[]> {
	const rows = await cached('blog-categories', () =>
		db
			.select({
				id: blogCategories.id,
				slug: blogCategories.slug,
				name: blogCategories.name,
				description: blogCategories.description,
				color: blogCategories.color
			})
			.from(blogCategories)
			.where(and(eq(blogCategories.isActive, true), isNull(blogCategories.deletedAt)))
			.orderBy(asc(blogCategories.sortOrder), asc(blogCategories.id))
	);

	return rows;
}

/**
 * The clauses that make a post publicly readable: published, live, not
 * soft-deleted, and with a publication date that has actually arrived.
 *
 * Written once and reused by every public blog query below. A post dated next
 * Monday is invisible until next Monday — that is the whole scheduling
 * mechanism, and it only works if nothing forgets to apply it, which is why no
 * caller assembles this for itself.
 */
const publiclyReadable = () =>
	and(
		eq(blogPosts.isPublished, true),
		eq(blogPosts.isActive, true),
		isNull(blogPosts.deletedAt),
		isNotNull(blogPosts.publishedAt),
		lte(blogPosts.publishedAt, new Date())
	);

/** The card columns. Deliberately not `body` — see `readMinutesSql`. */
const postCardColumns = {
	id: blogPosts.id,
	slug: blogPosts.slug,
	title: blogPosts.title,
	excerpt: blogPosts.excerpt,
	coverImage: blogPosts.coverImage,
	authorName: blogPosts.authorName,
	readMinutes: blogPosts.readMinutes,
	bodyLength: sql<number>`coalesce(length(${blogPosts.body}), 0)`,
	isFeatured: blogPosts.isFeatured,
	publishedAt: blogPosts.publishedAt,
	categorySlug: blogCategories.slug,
	categoryName: blogCategories.name,
	categoryColor: blogCategories.color
};

type PostCardRow = {
	id: number;
	slug: string;
	title: string;
	excerpt: string | null;
	coverImage: string | null;
	authorName: string | null;
	readMinutes: number;
	bodyLength: number;
	isFeatured: boolean;
	publishedAt: Date | null;
	categorySlug: string | null;
	categoryName: string | null;
	categoryColor: string | null;
};

const toCard = (row: PostCardRow): RenderBlogPost => ({
	id: row.id,
	slug: row.slug,
	title: row.title,
	excerpt: row.excerpt,
	coverImage: row.coverImage,
	authorName: row.authorName,
	// A stored 0 means "work it out", so an editor never has to count words.
	readMinutes: row.readMinutes || minutesFromLength(row.bodyLength),
	isFeatured: row.isFeatured,
	publishedAt: row.publishedAt ? row.publishedAt.getTime() : null,
	category: row.categorySlug
		? {
				slug: row.categorySlug,
				name: row.categoryName ?? '',
				color: row.categoryColor ?? 'olive'
			}
		: null
});

/**
 * One page of posts, filtered and counted in SQL.
 *
 * Not cached, and that is deliberate. Caching this would mean a key per
 * (search × category × page), which is exactly the unbounded key growth the
 * note at the top of `$lib/server/cache` warns against — the categories and
 * the featured post are the small, fixed things worth caching, and they are.
 * The indexes this leans on are `blog_posts_published_idx` and
 * `blog_posts_category_idx`.
 *
 * `body` is never selected here. It is by far the largest column in the table
 * and no card renders it; only its length comes back, so a page of twenty
 * cards costs twenty excerpts rather than twenty full articles.
 */
export async function searchBlogPosts(options: {
	query?: string;
	categorySlug?: string;
	page?: number;
	perPage?: number;
	/** Excluded from the results — the featured banner's post, on page one. */
	excludeId?: number | null;
}): Promise<{ posts: RenderBlogPost[]; total: number; page: number; pageCount: number }> {
	const perPage = Math.min(48, Math.max(1, options.perPage ?? 9));
	const search = (options.query ?? '').trim();

	const clauses: (SQL | undefined)[] = [publiclyReadable()];

	if (options.categorySlug) clauses.push(eq(blogCategories.slug, options.categorySlug));
	if (options.excludeId) clauses.push(ne(blogPosts.id, options.excludeId));

	if (search) {
		// `%` and `_` are LIKE wildcards; a reader searching for "50%" means the
		// characters, not "match everything".
		const needle = `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
		clauses.push(
			or(
				sql`${blogPosts.title} like ${needle} escape '\\'`,
				sql`${blogPosts.excerpt} like ${needle} escape '\\'`,
				sql`${blogCategories.name} like ${needle} escape '\\'`
			)
		);
	}

	const where = and(...(clauses.filter(Boolean) as SQL[]));

	// Counted before the rows are fetched, not alongside them: the page number
	// is clamped to the number of pages, so the offset the row query needs is
	// not known until the total is.
	const [counted] = await db
		.select({ value: count() })
		.from(blogPosts)
		.leftJoin(blogCategories, eq(blogCategories.id, blogPosts.categoryId))
		.where(where);

	const total = counted?.value ?? 0;
	const pageCount = Math.max(1, Math.ceil(total / perPage));
	// Clamped rather than returned empty: the usual way to land past the end is
	// to be on page 4 and then add a filter, and a blank screen reads as "no
	// posts" when the truth is "no posts *here*".
	const page = Math.min(Math.max(1, options.page ?? 1), pageCount);

	const posts = (await db
		.select(postCardColumns)
		.from(blogPosts)
		.leftJoin(blogCategories, eq(blogCategories.id, blogPosts.categoryId))
		.where(where)
		.orderBy(desc(blogPosts.publishedAt), desc(blogPosts.id))
		.limit(perPage)
		.offset((page - 1) * perPage)) as PostCardRow[];

	return { posts: posts.map(toCard), total, page, pageCount };
}

/**
 * The post promoted to the banner at the top of `/blog`, if there is one.
 *
 * Cached: it is one row, it changes when an editor ticks a box, and it is read
 * on every visit to the index.
 */
export async function getFeaturedBlogPost(): Promise<RenderBlogPost | null> {
	const rows = (await cached('blog:featured', () =>
		db
			.select(postCardColumns)
			.from(blogPosts)
			.leftJoin(blogCategories, eq(blogCategories.id, blogPosts.categoryId))
			.where(and(publiclyReadable(), eq(blogPosts.isFeatured, true)))
			.orderBy(desc(blogPosts.publishedAt), desc(blogPosts.id))
			.limit(1)
	)) as PostCardRow[];

	return rows[0] ? toCard(rows[0]) : null;
}

/**
 * Three more to read after a post: same category first, then anything recent,
 * so a post in a category of one still ends with somewhere to go.
 *
 * Two small indexed queries rather than loading the archive and filtering it.
 */
export async function getRelatedBlogPosts(
	postId: number,
	categorySlug: string | null,
	limit = 3
): Promise<RenderBlogPost[]> {
	const base = and(publiclyReadable(), ne(blogPosts.id, postId));

	const sameCategory = categorySlug
		? ((await db
				.select(postCardColumns)
				.from(blogPosts)
				.leftJoin(blogCategories, eq(blogCategories.id, blogPosts.categoryId))
				.where(and(base, eq(blogCategories.slug, categorySlug)))
				.orderBy(desc(blogPosts.publishedAt), desc(blogPosts.id))
				.limit(limit)) as PostCardRow[])
		: [];

	if (sameCategory.length >= limit) return sameCategory.map(toCard);

	const seen = new Set(sameCategory.map((row) => row.id));
	const filler = (await db
		.select(postCardColumns)
		.from(blogPosts)
		.leftJoin(blogCategories, eq(blogCategories.id, blogPosts.categoryId))
		.where(base)
		.orderBy(desc(blogPosts.publishedAt), desc(blogPosts.id))
		// Over-fetched by the number already held, since some of what comes back
		// will be the same-category posts that are already in the list.
		.limit(limit + seen.size)) as PostCardRow[];

	return [...sameCategory, ...filler.filter((row) => !seen.has(row.id))]
		.slice(0, limit)
		.map(toCard);
}

/** ~200 words a minute, over the text left once the HTML tags are stripped. */
function estimateReadMinutes(body: string | null): number {
	if (!body) return 1;
	const words = body
		.replace(/<[^>]*>/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean).length;
	return Math.max(1, Math.round(words / 200));
}

/**
 * The same estimate for list queries, from `length(body)` alone.
 *
 * Counting words needs the body, and the point of the card queries is not to
 * fetch it. English prose runs about 5.5 characters a word including the
 * space, so 200 words a minute is roughly 1,100 characters — close enough for
 * a "4 min read" label, and it costs nothing over the wire.
 */
const minutesFromLength = (chars: number): number => Math.max(1, Math.round(chars / 1100));

/**
 * One post with its body and gallery, or `null` for an unknown, unpublished
 * or not-yet-due slug — the route 404s on that rather than leaking a draft.
 */
export async function getBlogPost(slug: string): Promise<RenderBlogPostDetail | null> {
	const raw = await cached(`blog:post:${slug}`, async () => {
		const [post] = await db
			.select({
				id: blogPosts.id,
				slug: blogPosts.slug,
				title: blogPosts.title,
				excerpt: blogPosts.excerpt,
				body: blogPosts.body,
				coverImage: blogPosts.coverImage,
				authorName: blogPosts.authorName,
				metaDescription: blogPosts.metaDescription,
				readMinutes: blogPosts.readMinutes,
				isFeatured: blogPosts.isFeatured,
				publishedAt: blogPosts.publishedAt,
				categorySlug: blogCategories.slug,
				categoryName: blogCategories.name,
				categoryColor: blogCategories.color
			})
			.from(blogPosts)
			.leftJoin(blogCategories, eq(blogCategories.id, blogPosts.categoryId))
			// Not `publiclyReadable()`: this read is cached per slug, and folding
			// "the date has arrived" into a cached row would freeze the answer at
			// whatever it was when the cache filled. The date is checked below,
			// against the row that comes back, on every call.
			.where(
				and(
					eq(blogPosts.slug, slug),
					eq(blogPosts.isPublished, true),
					eq(blogPosts.isActive, true),
					isNull(blogPosts.deletedAt)
				)
			)
			.limit(1);

		if (!post) return null;

		const [gallery, videoRows] = await Promise.all([
			mediaFor('blog_post', post.id, 'image'),
			mediaFor('blog_post', post.id, 'video')
		]);

		const videos = videoRows.map((row) => ({
			id: row.id,
			youtubeUrl: row.url,
			caption: row.caption
		}));

		return { post, gallery, videos };
	});

	if (!raw) return null;

	const { post, gallery, videos } = raw;
	const publishedAt = post.publishedAt;
	if (!publishedAt || publishedAt.getTime() > Date.now()) return null;

	return {
		id: post.id,
		slug: post.slug,
		title: post.title,
		excerpt: post.excerpt,
		body: post.body,
		coverImage: post.coverImage,
		authorName: post.authorName,
		metaDescription: post.metaDescription,
		readMinutes: post.readMinutes || estimateReadMinutes(post.body),
		isFeatured: post.isFeatured,
		publishedAt: publishedAt.getTime(),
		category: post.categorySlug
			? {
					slug: post.categorySlug,
					name: post.categoryName ?? '',
					color: post.categoryColor ?? 'olive'
				}
			: null,
		gallery,
		// A link the player cannot be built from renders nothing, so it is
		// dropped here rather than sent to the browser to be skipped there.
		// Without this a post whose only video link is broken still renders the
		// "Watch" heading, over an empty space. The dashboard's own query keeps
		// the bad rows — that screen exists to show staff what needs fixing.
		videos: videos.filter((video) => isUsableYouTubeUrl(video.youtubeUrl))
	};
}

/* ==========================================================================
   Testimonials
   ========================================================================== */

const testimonialColumns = {
	id: testimonials.id,
	slug: testimonials.slug,
	name: testimonials.name,
	role: testimonials.role,
	quote: testimonials.quote,
	body: testimonials.body,
	photo: testimonials.photo,
	pillarSlug: pillars.slug,
	pillarName: pillars.name,
	pillarColor: pillars.color
};

type TestimonialRow = {
	id: number;
	slug: string;
	name: string;
	role: string | null;
	quote: string;
	body: string | null;
	photo: string | null;
	pillarSlug: string | null;
	pillarName: string | null;
	pillarColor: string | null;
};

const toTestimonial = (row: TestimonialRow): RenderTestimonial => ({
	id: row.id,
	slug: row.slug,
	name: row.name,
	role: row.role,
	quote: row.quote,
	body: row.body,
	photo: row.photo,
	pillar: row.pillarSlug
		? { slug: row.pillarSlug, name: row.pillarName ?? '', color: row.pillarColor ?? 'olive' }
		: null
});

/** Everything on the public testimonials wall — `show_on_site` is the switch. */
export async function getTestimonials(): Promise<RenderTestimonial[]> {
	const rows = await cached('testimonials', () =>
		db
			.select(testimonialColumns)
			.from(testimonials)
			.leftJoin(pillars, eq(pillars.id, testimonials.pillarId))
			.where(
				and(
					eq(testimonials.showOnSite, true),
					eq(testimonials.isActive, true),
					isNull(testimonials.deletedAt)
				)
			)
			.orderBy(asc(testimonials.sortOrder), asc(testimonials.id))
	);

	return rows.map(toTestimonial);
}

/**
 * The handful in the homepage slider.
 *
 * A separate flag rather than "the first few of the wall": the front page
 * carries a different weight, and which quotes belong there is an editorial
 * decision, not a consequence of sort order.
 */
export async function getFeaturedTestimonials(): Promise<RenderTestimonial[]> {
	const rows = await cached('testimonials:featured', () =>
		db
			.select(testimonialColumns)
			.from(testimonials)
			.leftJoin(pillars, eq(pillars.id, testimonials.pillarId))
			.where(
				and(
					eq(testimonials.isFeatured, true),
					eq(testimonials.isActive, true),
					isNull(testimonials.deletedAt)
				)
			)
			.orderBy(asc(testimonials.sortOrder), asc(testimonials.id))
	);

	return rows.map(toTestimonial);
}

/* ==========================================================================
   Media for public pages
   ========================================================================== */

export interface OwnerMedia {
	gallery: { id: number; storagePath: string; caption: string | null }[];
	videos: { id: number; youtubeUrl: string; caption: string | null }[];
}

/**
 * One owner's photographs and videos, ready to render.
 *
 * Unparseable video links are dropped rather than sent to the browser to be
 * skipped there — otherwise a section heading renders over an empty space.
 */
export async function getOwnerMedia(ownerType: MediaOwner, ownerId: number): Promise<OwnerMedia> {
	const rows = await cached(`media:${ownerType}:${ownerId}`, () =>
		db
			.select({
				id: mediaItems.id,
				kind: mediaItems.kind,
				url: mediaItems.url,
				caption: mediaItems.caption
			})
			.from(mediaItems)
			.where(and(eq(mediaItems.ownerType, ownerType), eq(mediaItems.ownerId, ownerId)))
			.orderBy(asc(mediaItems.sortOrder), asc(mediaItems.id))
	);

	return {
		gallery: rows
			.filter((row) => row.kind === 'image')
			.map((row) => ({ id: row.id, storagePath: row.url, caption: row.caption })),
		videos: rows
			.filter((row) => row.kind === 'video' && isUsableYouTubeUrl(row.url))
			.map((row) => ({ id: row.id, youtubeUrl: row.url, caption: row.caption }))
	};
}

/** Media for several owners of one type at once, keyed by owner id. */
export async function getMediaByOwner(
	ownerType: MediaOwner,
	ownerIds: number[]
): Promise<Record<number, OwnerMedia>> {
	if (!ownerIds.length) return {};

	const rows = await db
		.select({
			ownerId: mediaItems.ownerId,
			id: mediaItems.id,
			kind: mediaItems.kind,
			url: mediaItems.url,
			caption: mediaItems.caption
		})
		.from(mediaItems)
		.where(and(eq(mediaItems.ownerType, ownerType), inArray(mediaItems.ownerId, ownerIds)))
		.orderBy(asc(mediaItems.sortOrder), asc(mediaItems.id));

	const grouped: Record<number, OwnerMedia> = {};
	for (const id of ownerIds) grouped[id] = { gallery: [], videos: [] };

	for (const row of rows) {
		const bucket = grouped[row.ownerId];
		if (!bucket) continue;
		if (row.kind === 'image') {
			bucket.gallery.push({ id: row.id, storagePath: row.url, caption: row.caption });
		} else if (isUsableYouTubeUrl(row.url)) {
			bucket.videos.push({ id: row.id, youtubeUrl: row.url, caption: row.caption });
		}
	}

	return grouped;
}

/* ==========================================================================
   Invalidation
   ========================================================================== */

/**
 * Called by the dashboard after any content write. Grouped here so a new CRUD
 * screen wires up cache invalidation by naming a group, not by remembering
 * which four keys a pillar edit touches.
 */
export const CONTENT_CACHE_KEYS = {
	navigation: ['nav', 'pages:list'],
	pages: ['page', 'pages:list', 'nav', 'media:content_block'],
	pillars: ['pillars', 'page', 'media:pillar'],
	initiatives: ['initiatives', 'page', 'media:initiative'],
	regions: ['regions'],
	payments: ['payment-options', 'donation-campaigns'],
	about: ['about', 'about-gallery', 'media:about'],
	heroGallery: ['hero-gallery'],
	homepageGallery: ['homepage-gallery'],
	// `invalidate('blog')` drops `blog:list`, `blog:post:*` and `blog:featured`
	// in one go — see the prefix rule in `$lib/server/cache`.
	blog: ['blog', 'blog-categories', 'media:blog_post'],
	testimonials: ['testimonials', 'media:testimonial'],
	campaigns: ['donation-campaigns', 'media:campaign']
} as const;

export type ContentCacheGroup = keyof typeof CONTENT_CACHE_KEYS;

export const invalidateContent = (group: keyof typeof CONTENT_CACHE_KEYS) => {
	for (const key of CONTENT_CACHE_KEYS[group]) invalidate(key);
};
