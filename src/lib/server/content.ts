import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	aboutContent,
	aboutGalleryImages,
	contentBlocks,
	donationCampaigns,
	files,
	futureInitiatives,
	heroGalleryImages,
	homepageGalleryImages,
	navigationItems,
	pages,
	pillars,
	regions,
	paymentAccounts,
	paymentMethods
} from '$lib/server/db/schema';
import { cached, invalidate } from '$lib/server/cache';
import { paypalTarget } from '$lib/donations';
import type {
	RenderBlock,
	RenderDonationCampaign,
	RenderNavItem,
	RenderPage,
	RenderPillar
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
			content: (block.content ?? {}) as Record<string, unknown>
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

export async function getAboutGallery() {
	const rows = await cached('about-gallery', () =>
		db
			.select({
				id: aboutGalleryImages.id,
				caption: aboutGalleryImages.caption,
				storagePath: files.storagePath
			})
			.from(aboutGalleryImages)
			.innerJoin(files, eq(files.id, aboutGalleryImages.fileId))
			.orderBy(asc(aboutGalleryImages.sortOrder), asc(aboutGalleryImages.id))
	);

	return rows;
}

/**
 * The homepage hero's photo set. Ordered, captioned, and — unlike the old
 * `hero.image` setting — allowed to hold any number of photos, so the header
 * can rotate through a small collage instead of a single fixed banner.
 */
export async function getHeroGallery() {
	const rows = await cached('hero-gallery', () =>
		db
			.select({
				id: heroGalleryImages.id,
				caption: heroGalleryImages.caption,
				storagePath: files.storagePath
			})
			.from(heroGalleryImages)
			.innerJoin(files, eq(files.id, heroGalleryImages.fileId))
			.orderBy(asc(heroGalleryImages.sortOrder), asc(heroGalleryImages.id))
	);

	return rows;
}

/**
 * The general photo section further down the homepage — moments from the
 * programmes, separate from the hero collage.
 */
export async function getHomepageGallery() {
	const rows = await cached('homepage-gallery', () =>
		db
			.select({
				id: homepageGalleryImages.id,
				caption: homepageGalleryImages.caption,
				storagePath: files.storagePath
			})
			.from(homepageGalleryImages)
			.innerJoin(files, eq(files.id, homepageGalleryImages.fileId))
			.orderBy(asc(homepageGalleryImages.sortOrder), asc(homepageGalleryImages.id))
	);

	return rows;
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
   Invalidation
   ========================================================================== */

/**
 * Called by the dashboard after any content write. Grouped here so a new CRUD
 * screen wires up cache invalidation by naming a group, not by remembering
 * which four keys a pillar edit touches.
 */
export const CONTENT_CACHE_KEYS = {
	navigation: ['nav', 'pages:list'],
	pages: ['page', 'pages:list', 'nav'],
	pillars: ['pillars', 'page'],
	initiatives: ['initiatives', 'page'],
	regions: ['regions'],
	payments: ['payment-options', 'donation-campaigns'],
	about: ['about', 'about-gallery'],
	heroGallery: ['hero-gallery'],
	homepageGallery: ['homepage-gallery']
} as const;

export const invalidateContent = (group: keyof typeof CONTENT_CACHE_KEYS) => {
	for (const key of CONTENT_CACHE_KEYS[group]) invalidate(key);
};
