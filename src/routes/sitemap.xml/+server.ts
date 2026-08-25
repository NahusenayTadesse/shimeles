import { and, asc, desc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { blogPosts, pages, pillars } from '$lib/server/db/schema';
import { settingsMap } from '$lib/server/settings';
import { siteOrigin } from '$lib/seo';
import type { RequestHandler } from './$types';

/**
 * The sitemap.
 *
 * Built from the database on request rather than generated at build time,
 * because the whole point of this system is that staff publish a page or a post
 * without a deploy — a sitemap frozen at build time would list last month's
 * site and quietly stop telling Google about anything new.
 *
 * What is deliberately *not* in here:
 *
 * - `/forms/*`, which carry personal circumstances in their query strings and
 *   are `noindex` for that reason.
 * - `/dashboard`, `/login`, `/setup` — staff surface, and not public.
 * - Filtered blog views (`?category=`, `?q=`). A sitemap is a list of pages
 *   worth indexing, not of every URL that resolves; the category views are
 *   reachable from `/blog` and Google can decide for itself.
 *
 * A URL in a sitemap that returns 404, redirects, or says `noindex` is a
 * quality signal against the whole file, so everything listed here is filtered
 * exactly the way the public routes filter it.
 */

/** `&`, `<` and `>` in a slug would produce invalid XML. */
const escapeXml = (value: string) =>
	value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');

interface Entry {
	path: string;
	lastmod?: Date | null;
	/** Relative to the other pages on this site — not an absolute ranking. */
	priority: string;
	changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
	/** A `files` storage name; emitted as an image entry for Google Images. */
	image?: string | null;
}

export const GET: RequestHandler = async ({ url, setHeaders }) => {
	const settings = await settingsMap();
	const origin = siteOrigin(settings, url.origin);

	const [publishedPages, activePillars, posts] = await Promise.all([
		db
			.select({
				slug: pages.slug,
				updatedAt: pages.updatedAt,
				shareImage: pages.shareImage
			})
			.from(pages)
			.where(and(eq(pages.isPublished, true), eq(pages.isActive, true), isNull(pages.deletedAt)))
			.orderBy(asc(pages.sortOrder)),
		db
			.select({ slug: pillars.slug, updatedAt: pillars.updatedAt, image: pillars.image })
			.from(pillars)
			.where(and(eq(pillars.isActive, true), isNull(pillars.deletedAt)))
			.orderBy(asc(pillars.sortOrder)),
		db
			.select({
				slug: blogPosts.slug,
				updatedAt: blogPosts.updatedAt,
				publishedAt: blogPosts.publishedAt,
				coverImage: blogPosts.coverImage
			})
			.from(blogPosts)
			.where(
				and(
					eq(blogPosts.isPublished, true),
					eq(blogPosts.isActive, true),
					isNull(blogPosts.deletedAt),
					isNotNull(blogPosts.publishedAt),
					// A post scheduled for next week is not published yet, and listing
					// it hands Google a URL that 404s.
					lte(blogPosts.publishedAt, new Date())
				)
			)
			.orderBy(desc(blogPosts.publishedAt))
	]);

	const home = publishedPages.find((row) => row.slug === 'home');

	const entries: Entry[] = [
		{
			path: '/',
			lastmod: home?.updatedAt ?? null,
			priority: '1.0',
			changefreq: 'weekly',
			image: home?.shareImage ?? null
		},

		// The hand-built routes. They are real pages with no `pages` row of their
		// own — see the note at the top of `schema.ts` — so they are listed here
		// rather than discovered.
		{ path: '/about', priority: '0.8', changefreq: 'monthly' },
		{ path: '/blog', priority: '0.7', changefreq: 'weekly' },
		{ path: '/testimonials', priority: '0.6', changefreq: 'monthly' },

		...publishedPages
			// `/home` would be a second URL for `/`, which the catch-all route
			// 404s on purpose. It is already listed above as `/`.
			.filter((row) => row.slug !== 'home')
			.map((row): Entry => ({
				path: `/${row.slug}`,
				lastmod: row.updatedAt,
				// Applying, giving and volunteering are what someone arrives at
				// this site to do, and they are the pages worth ranking.
				priority: ['apply', 'donate', 'volunteer', 'contact'].includes(row.slug) ? '0.9' : '0.6',
				changefreq: 'monthly',
				image: row.shareImage
			})),

		...activePillars.map((row): Entry => ({
			path: `/programs/${row.slug}`,
			lastmod: row.updatedAt,
			priority: '0.8',
			changefreq: 'monthly',
			image: row.image
		})),

		...posts.map((row): Entry => ({
			path: `/blog/${row.slug}`,
			// The edit date, not the publication date: it is what `lastmod` means
			// and what decides whether a crawler bothers to come back.
			lastmod: row.updatedAt ?? row.publishedAt,
			priority: '0.6',
			changefreq: 'yearly',
			image: row.coverImage
		}))
	];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries
	.map((entry) => {
		const loc = `${origin}${entry.path}`;
		const lastmod = entry.lastmod ? `\n\t\t<lastmod>${entry.lastmod.toISOString()}</lastmod>` : '';
		const image = entry.image
			? `\n\t\t<image:image>\n\t\t\t<image:loc>${escapeXml(`${origin}/files/${entry.image}`)}</image:loc>\n\t\t</image:image>`
			: '';
		return `\t<url>\n\t\t<loc>${escapeXml(loc)}</loc>${lastmod}\n\t\t<changefreq>${entry.changefreq}</changefreq>\n\t\t<priority>${entry.priority}</priority>${image}\n\t</url>`;
	})
	.join('\n')}
</urlset>
`;

	// An hour: long enough that a crawler hitting it repeatedly costs nothing,
	// short enough that a post published this morning is listed this morning.
	setHeaders({
		'Content-Type': 'application/xml; charset=utf-8',
		'Cache-Control': 'public, max-age=3600'
	});

	return new Response(body);
};
