/**
 * What every public page tells Google, Facebook and WhatsApp about itself.
 *
 * Before this existed, each route hand-wrote its own `<svelte:head>`: some had
 * a description, some did not, three spelled the site name differently, the
 * homepage had no `og:` tags at all, and every `og:image` was a *relative*
 * path — which no social scraper resolves, so the Foundation's links had been
 * previewing as a bare grey box everywhere they were shared.
 *
 * One resolver, one component (`$lib/components/Seo.svelte`), one set of rules:
 *
 * - **Absolute URLs, always.** `og:image`, `og:url` and `<link rel=canonical>`
 *   are read by machines that are not on this origin and cannot resolve `/`.
 * - **The origin comes from `site.url`, not from the request.** A page reached
 *   at `www.` and at the apex must name the *same* canonical URL, or the two
 *   compete as duplicates. `site.url` is a setting, so the Foundation moves
 *   domain without a deploy (§0); the request's own origin is the fallback for
 *   a fresh install where it has not been filled in.
 * - **Nothing here is a string literal that a staff member might want to
 *   change.** The site name, the tagline, the fallback share image and the
 *   description all come from `site_settings`.
 */

/** Trailing slashes make `${origin}/${path}` produce a double slash. */
const trimEnd = (value: string) => value.replace(/\/+$/, '');

/**
 * Google truncates a description around 155–160 characters, and a sentence cut
 * mid-word reads as broken rather than as abbreviated. Cut on a word boundary
 * and add an ellipsis so it reads as deliberate.
 */
export function clampDescription(text: string, max = 160): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	if (clean.length <= max) return clean;

	const cut = clean.slice(0, max - 1);
	const lastSpace = cut.lastIndexOf(' ');
	return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

/** Strips HTML so a rich-text body can be used as a description. */
export const stripHtml = (html: string) =>
	html
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, ' ')
		.trim();

export interface SeoSettings {
	[key: string]: string;
}

export interface SeoInput {
	/** The page's own title, without the site name. Omit on the homepage. */
	title?: string | null;
	description?: string | null;
	/**
	 * A `files` storage name (`abc.webp`), a root-relative path (`/og.png`), or
	 * an absolute URL. All three end up absolute.
	 */
	image?: string | null;
	imageAlt?: string | null;
	/** `article` for blog posts; everything else is a `website`. */
	type?: 'website' | 'article';
	/** Path to declare as canonical, when it is not the current one. */
	canonicalPath?: string | null;
	/** Keep the page out of search results — forms, previews, staff screens. */
	noindex?: boolean;
	/** Article metadata. Ignored unless `type` is `article`. */
	publishedAt?: Date | string | number | null;
	modifiedAt?: Date | string | number | null;
	author?: string | null;
	section?: string | null;
	tags?: string[];
}

export interface ResolvedSeo {
	title: string;
	description: string;
	canonical: string;
	origin: string;
	siteName: string;
	image: string;
	imageAlt: string;
	/** Only known for the built-in card, whose dimensions we ship. */
	imageWidth: string | null;
	imageHeight: string | null;
	type: 'website' | 'article';
	robots: string;
	locale: string;
	publishedAt: string | null;
	modifiedAt: string | null;
	author: string | null;
	section: string | null;
	tags: string[];
}

/**
 * The share card shipped with the code, used when neither the page nor the
 * settings name an image.
 *
 * A static asset rather than a setting because a link with *no* preview image
 * is the one outcome worth ruling out entirely — `seo.share_image` overrides
 * it, and `scripts/og-image.ts` regenerates it from the site's own palette.
 */
const DEFAULT_SHARE_IMAGE = { path: '/og-default.png', width: '1200', height: '630' };

const toIso = (value: Date | string | number | null | undefined): string | null => {
	if (value == null) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** Resolves the site's public origin: the setting first, the request second. */
export function siteOrigin(settings: SeoSettings, requestOrigin: string): string {
	const configured = (settings['site.url'] ?? '').trim();
	return trimEnd(configured || requestOrigin);
}

/**
 * Turns any of the three image forms into an absolute URL.
 *
 * The bare-name case is the common one: `pages.share_image`,
 * `blog_posts.cover_image` and `pillars.image` all store a `files` storage
 * name, and the URL it is served at is `/files/<name>`.
 */
export function absoluteImage(image: string, origin: string): string {
	if (/^https?:\/\//i.test(image)) return image;
	if (image.startsWith('/')) return `${origin}${image}`;
	return `${origin}/files/${image}`;
}

export function absoluteUrl(path: string, origin: string): string {
	if (/^https?:\/\//i.test(path)) return path;
	return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Builds the final tag values for one page.
 *
 * `pathname` and `search` come from the current URL rather than being passed
 * in, so a route only ever describes *itself* — the plumbing is not its
 * problem.
 */
export function resolveSeo(
	input: SeoInput,
	settings: SeoSettings,
	url: { origin: string; pathname: string; search: string }
): ResolvedSeo {
	const origin = siteOrigin(settings, url.origin);
	const siteName = settings['site.name']?.trim() || 'Shimeles Abera Foundation';
	const tagline = settings['site.tagline']?.trim() || '';

	/*
	 * The homepage is titled from the site itself.
	 *
	 * Its `pages` row is called "Home", which as a `<title>` is both the least
	 * informative thing the tab could say and a wasted search result: the
	 * homepage is the one page whose title has to carry the organisation's
	 * name and what it does.
	 */
	const isHome = url.pathname === '/';
	const title = input.title?.trim()
		? `${input.title.trim()} · ${siteName}`
		: isHome && tagline
			? `${siteName} · ${tagline}`
			: siteName;

	const description = clampDescription(
		input.description?.trim() || settings['seo.description']?.trim() || tagline || ''
	);

	const configuredImage = settings['seo.share_image']?.trim();
	const rawImage = input.image?.trim() || configuredImage || DEFAULT_SHARE_IMAGE.path;
	const isDefaultCard = rawImage === DEFAULT_SHARE_IMAGE.path;

	/*
	 * The canonical URL deliberately drops the query string.
	 *
	 * `?category=` and `?page=` are handled by the pages that use them, which
	 * pass an explicit `canonicalPath` including the parameters that identify a
	 * genuinely different list. Everything else — a `?fbclid=` a visitor
	 * arrived with, a stray UTM tag — describes the *visit*, not the page, and
	 * left in a canonical it would split one page into hundreds.
	 */
	const canonical = absoluteUrl(input.canonicalPath?.trim() || url.pathname, origin);

	return {
		title,
		description,
		canonical,
		origin,
		siteName,
		image: absoluteImage(rawImage, origin),
		imageAlt: input.imageAlt?.trim() || `${siteName} — ${tagline || siteName}`,
		imageWidth: isDefaultCard ? DEFAULT_SHARE_IMAGE.width : null,
		imageHeight: isDefaultCard ? DEFAULT_SHARE_IMAGE.height : null,
		type: input.type ?? 'website',
		/*
		 * `max-image-preview:large` is what lets a result carry a full-width
		 * photo rather than a thumbnail, and `max-snippet:-1` lets Google show
		 * as much of the description as it judges useful. Both are opt-in.
		 */
		robots: input.noindex
			? 'noindex, follow'
			: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
		locale: 'en_US',
		publishedAt: toIso(input.publishedAt),
		modifiedAt: toIso(input.modifiedAt),
		author: input.author?.trim() || null,
		section: input.section?.trim() || null,
		tags: input.tags ?? []
	};
}

/* ==========================================================================
   Structured data (JSON-LD)
   ========================================================================== */

/**
 * The Foundation itself, as Google understands it.
 *
 * `NGO` rather than `Organization`: it is the accurate type and it is what
 * populates a knowledge panel. `sameAs` is the load-bearing field — it is how
 * Google connects this site to the Foundation's Facebook and YouTube presence
 * instead of treating them as three unrelated things.
 */
export function organisationJsonLd(settings: SeoSettings, origin: string) {
	const siteName = settings['site.name']?.trim() || 'Shimeles Abera Foundation';

	const sameAs = [
		'social.facebook',
		'social.instagram',
		'social.youtube',
		'social.linkedin',
		'social.tiktok',
		'social.telegram'
	]
		.map((key) => settings[key]?.trim())
		.filter((value): value is string => Boolean(value));

	const email = settings['contact.email_primary']?.trim();
	const phone = settings['contact.phone_1']?.trim();
	const address = settings['contact.address']?.trim();
	const logo = settings['site.logo']?.trim();

	return {
		'@context': 'https://schema.org',
		'@type': 'NGO',
		'@id': `${origin}/#organisation`,
		name: siteName,
		alternateName: settings['site.name_am']?.trim() || undefined,
		url: `${origin}/`,
		logo: absoluteImage(logo || '/logo.png', origin),
		image: absoluteImage(settings['seo.share_image']?.trim() || DEFAULT_SHARE_IMAGE.path, origin),
		description: clampDescription(
			settings['seo.description']?.trim() || settings['site.tagline']?.trim() || '',
			300
		),
		...(sameAs.length ? { sameAs } : {}),
		...(email || phone
			? {
					contactPoint: {
						'@type': 'ContactPoint',
						contactType: 'customer support',
						...(email ? { email } : {}),
						...(phone ? { telephone: phone } : {}),
						availableLanguage: ['en', 'am']
					}
				}
			: {}),
		...(address
			? {
					address: {
						'@type': 'PostalAddress',
						streetAddress: address.replace(/\s*\n\s*/g, ', '),
						addressCountry: 'ET'
					}
				}
			: {})
	};
}

/** The site as a whole. Paired with the organisation by `publisher`. */
export function websiteJsonLd(settings: SeoSettings, origin: string) {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		'@id': `${origin}/#website`,
		url: `${origin}/`,
		name: settings['site.name']?.trim() || 'Shimeles Abera Foundation',
		inLanguage: 'en',
		publisher: { '@id': `${origin}/#organisation` }
	};
}

/**
 * The trail shown under a search result instead of a bare URL.
 *
 * Takes the labels a page already knows — it must match what a visitor sees on
 * the page, or it is a structured-data violation rather than a rich result.
 */
export function breadcrumbJsonLd(crumbs: { name: string; path: string }[], origin: string) {
	return {
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: crumbs.map((crumb, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: crumb.name,
			item: absoluteUrl(crumb.path, origin)
		}))
	};
}

export interface ArticleJsonLdInput {
	title: string;
	description: string;
	url: string;
	image: string;
	publishedAt: string | null;
	modifiedAt: string | null;
	author: string | null;
	section: string | null;
}

/** A blog post. `BlogPosting` is the type Google reads for article results. */
export function articleJsonLd(article: ArticleJsonLdInput, settings: SeoSettings, origin: string) {
	return {
		'@context': 'https://schema.org',
		'@type': 'BlogPosting',
		headline: clampDescription(article.title, 110),
		description: article.description,
		image: [article.image],
		mainEntityOfPage: { '@type': 'WebPage', '@id': article.url },
		...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
		// Google reads `dateModified` for freshness; falling back to the
		// publication date is better than omitting it, and is never a lie.
		dateModified: article.modifiedAt ?? article.publishedAt ?? undefined,
		...(article.section ? { articleSection: article.section } : {}),
		author: {
			'@type': article.author ? 'Person' : 'Organization',
			name: article.author || settings['site.name']?.trim() || 'Shimeles Abera Foundation',
			...(article.author ? {} : { '@id': `${origin}/#organisation` })
		},
		publisher: { '@id': `${origin}/#organisation` },
		inLanguage: 'en'
	};
}
