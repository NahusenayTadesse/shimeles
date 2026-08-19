import { fail } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	blogPosts,
	contentBlocks,
	donationCampaigns,
	files,
	futureInitiatives,
	mediaItems,
	pillars,
	testimonials,
	type MediaOwner
} from '$lib/server/db/schema';
import { savePublicImage, deleteStoredFile } from '$lib/server/upload';
import { invalidateContent, type ContentCacheGroup } from '$lib/server/content';
import { audit } from '$lib/server/audit';
import { requirePermission, type Permission } from '$lib/server/permissions';
import { isUsableYouTubeUrl } from '$lib/youtube';

/**
 * Photos and videos, for any owner.
 *
 * Every gallery screen used to carry its own copy of five actions — add,
 * caption, delete, reorder, and the upload plumbing behind them. Four copies
 * existed and had already drifted apart. This is the one implementation they
 * all now call, parameterised by which owner it is acting for.
 *
 * `owner_id` is polymorphic and therefore carries no foreign key (see the note
 * in `schema.ts`), so the cascade SQLite would have given us for free is
 * `deleteMediaFor()` below. Every owner's delete path has to call it — that is
 * the price of the shared table, and it is stated here rather than left to be
 * discovered.
 */

export interface MediaScope {
	ownerType: MediaOwner;
	/** 0 for the site-level collections (`hero`, `homepage`). */
	ownerId: number;
	permission: Permission;
	/** Cache group dropped after a write, so the public site sees the change. */
	invalidates: ContentCacheGroup;
}

export interface MediaRow {
	id: number;
	kind: 'image' | 'video';
	url: string;
	caption: string | null;
	/** Alias of `url` for images — what `GalleryUpload` and `Gallery` both take. */
	storagePath: string;
}

const scopeWhere = (scope: MediaScope) =>
	and(eq(mediaItems.ownerType, scope.ownerType), eq(mediaItems.ownerId, scope.ownerId));

/** One owner's media, in display order. */
export async function listMedia(scope: MediaScope, kind?: 'image' | 'video'): Promise<MediaRow[]> {
	const rows = await db
		.select({
			id: mediaItems.id,
			kind: mediaItems.kind,
			url: mediaItems.url,
			caption: mediaItems.caption
		})
		.from(mediaItems)
		.where(kind ? and(scopeWhere(scope), eq(mediaItems.kind, kind)) : scopeWhere(scope))
		.orderBy(asc(mediaItems.sortOrder), asc(mediaItems.id));

	return rows.map((row) => ({ ...row, storagePath: row.url }));
}

/** Images and videos in one call, for a screen that shows both. */
export async function listMediaSplit(scope: MediaScope) {
	const rows = await listMedia(scope);
	return {
		images: rows.filter((row) => row.kind === 'image'),
		videos: rows
			.filter((row) => row.kind === 'video')
			.map((row) => ({ id: row.id, youtubeUrl: row.url, caption: row.caption }))
	};
}

/** Next free sort position for this owner and kind. */
async function nextSortOrder(scope: MediaScope, kind: 'image' | 'video') {
	const existing = await db
		.select({ id: mediaItems.id })
		.from(mediaItems)
		.where(and(scopeWhere(scope), eq(mediaItems.kind, kind)));
	return existing.length;
}

/**
 * Removes every media item belonging to an owner, and the image bytes with it.
 *
 * The stand-in for the `ON DELETE CASCADE` a polymorphic key cannot have. Call
 * it whenever an owner row is deleted — a post, a testimonial, a content block
 * — or its photographs outlive it as rows nothing can reach and files nothing
 * will ever clean up.
 */
export async function deleteMediaFor(ownerType: MediaOwner, ownerId: number): Promise<void> {
	const rows = await db
		.select({ id: mediaItems.id, fileId: mediaItems.fileId })
		.from(mediaItems)
		.where(and(eq(mediaItems.ownerType, ownerType), eq(mediaItems.ownerId, ownerId)));

	if (!rows.length) return;

	await db.delete(mediaItems).where(
		inArray(
			mediaItems.id,
			rows.map((row) => row.id)
		)
	);

	for (const row of rows) if (row.fileId) await deleteStoredFile(row.fileId);
}

/**
 * The five actions every media-owning screen needs.
 *
 * Returned as an object to spread into a route's `actions`, so a screen adds a
 * gallery by naming its owner rather than by copying a hundred lines:
 *
 * ```ts
 * export const actions = { ...mediaActions(() => scope), save: … };
 * ```
 *
 * The scope is a function of the event rather than a value, because an owner
 * id usually comes out of the URL and is not known until the request arrives.
 */
export function mediaActions(resolve: (event: RequestEvent) => Promise<MediaScope> | MediaScope) {
	const guard = async (event: RequestEvent) => {
		const scope = await resolve(event);
		const access = await requirePermission(event, scope.permission);
		return { scope, access };
	};

	/** Every write scopes by owner as well as by item id, so a hand-crafted
	 *  POST cannot reach another owner's photographs. */
	const owned = (scope: MediaScope, id: number) => and(scopeWhere(scope), eq(mediaItems.id, id));

	return {
		addGalleryImages: async (event: RequestEvent) => {
			const { scope, access } = await guard(event);
			const formData = await event.request.formData();
			const uploads = formData
				.getAll('images')
				.filter((f): f is File => f instanceof File && f.size > 0);

			if (!uploads.length) return fail(400, { error: 'Choose at least one photo.' });

			let sortOrder = await nextSortOrder(scope, 'image');
			for (const upload of uploads) {
				const storagePath = await savePublicImage(upload, access.userId);
				// The upload writes a `files` row; it is looked up here so deleting
				// the item later can also delete the bytes.
				const [fileRow] = await db
					.select({ id: files.id })
					.from(files)
					.where(eq(files.storagePath, storagePath))
					.limit(1);

				await db.insert(mediaItems).values({
					ownerType: scope.ownerType,
					ownerId: scope.ownerId,
					kind: 'image',
					url: storagePath,
					fileId: fileRow?.id ?? null,
					sortOrder: sortOrder++,
					createdBy: access.userId,
					createdAt: new Date()
				});
			}

			invalidateContent(scope.invalidates);
			audit({ event, action: 'created', entityType: 'media_item', entityId: scope.ownerId });
			return { ok: true };
		},

		addVideo: async (event: RequestEvent) => {
			const { scope, access } = await guard(event);
			const formData = await event.request.formData();
			const youtubeUrl = String(formData.get('youtubeUrl') ?? '').trim();
			const caption = String(formData.get('caption') ?? '').trim();

			if (!youtubeUrl) return fail(400, { error: 'Paste a YouTube link first.' });

			// The browser checks this too, but that check is a convenience and this
			// one is the rule: a link the player cannot be built from would render
			// as a blank space on the live page.
			if (!isUsableYouTubeUrl(youtubeUrl)) {
				return fail(400, {
					error: 'That is not a YouTube link. Paste the address from your browser bar.'
				});
			}

			await db.insert(mediaItems).values({
				ownerType: scope.ownerType,
				ownerId: scope.ownerId,
				kind: 'video',
				url: youtubeUrl,
				caption: caption || null,
				sortOrder: await nextSortOrder(scope, 'video'),
				createdBy: access.userId,
				createdAt: new Date()
			});

			invalidateContent(scope.invalidates);
			audit({ event, action: 'created', entityType: 'media_item', entityId: scope.ownerId });
			return { ok: true };
		},

		updateGalleryCaption: async (event: RequestEvent) => {
			const { scope } = await guard(event);
			const formData = await event.request.formData();
			const id = Number(formData.get('imageId') ?? formData.get('videoId'));
			const caption = String(formData.get('caption') ?? '').trim();

			if (!Number.isFinite(id)) return fail(400, { error: 'Unknown item.' });

			await db
				.update(mediaItems)
				.set({ caption: caption || null })
				.where(owned(scope, id));

			invalidateContent(scope.invalidates);
			audit({ event, action: 'updated', entityType: 'media_item', entityId: id });
			return { ok: true };
		},

		deleteGalleryImage: async (event: RequestEvent) => {
			const { scope } = await guard(event);
			const formData = await event.request.formData();
			const id = Number(formData.get('imageId') ?? formData.get('videoId'));
			if (!Number.isFinite(id)) return fail(400, { error: 'Unknown item.' });

			const [row] = await db
				.select({ fileId: mediaItems.fileId })
				.from(mediaItems)
				.where(owned(scope, id))
				.limit(1);

			if (!row) return fail(404, { error: 'Unknown item.' });

			await db.delete(mediaItems).where(owned(scope, id));
			if (row.fileId) await deleteStoredFile(row.fileId);

			invalidateContent(scope.invalidates);
			audit({ event, action: 'deleted', entityType: 'media_item', entityId: id });
			return { ok: true };
		},

		reorderGallery: async (event: RequestEvent) => {
			const { scope } = await guard(event);
			const formData = await event.request.formData();
			const order = String(formData.get('order') ?? '')
				.split(',')
				.map(Number)
				.filter(Number.isFinite);

			if (!order.length) return fail(400, { error: 'Nothing to reorder.' });

			db.transaction((tx) => {
				order.forEach((id, index) => {
					tx.update(mediaItems).set({ sortOrder: index }).where(owned(scope, id)).run();
				});
			});

			invalidateContent(scope.invalidates);
			audit({ event, action: 'updated', entityType: 'media_item', entityId: null });
			return { ok: true };
		}
	};
}

/**
 * The same actions under a prefix, for a screen carrying more than one
 * collection — the homepage has both the hero rotation and the strip further
 * down, and SvelteKit action names share one namespace per route.
 *
 * `mediaActions(…, 'homepage')` yields `homepageAddGalleryImages` and so on;
 * `GalleryUpload` already takes its action names as props.
 */
export function prefixedMediaActions(
	prefix: string,
	resolve: (event: RequestEvent) => Promise<MediaScope> | MediaScope
) {
	const base = mediaActions(resolve);
	const capitalise = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);
	return Object.fromEntries(
		Object.entries(base).map(([key, action]) => [`${prefix}${capitalise(key)}`, action])
	) as Record<string, (typeof base)['addVideo']>;
}

/**
 * The video actions under the names `VideoLinks` posts to.
 *
 * `GalleryUpload` and `VideoLinks` were written against separate action names,
 * and both are in use. Rather than change either component's contract, the
 * shared implementations are exposed under both sets of names.
 */
export function mediaVideoActions(
	resolve: (event: RequestEvent) => Promise<MediaScope> | MediaScope
) {
	const base = mediaActions(resolve);
	return {
		addVideo: base.addVideo,
		updateVideoCaption: base.updateGalleryCaption,
		deleteVideo: base.deleteGalleryImage,
		reorderVideos: base.reorderGallery
	};
}

/* ==========================================================================
   Describing an owner
   ========================================================================== */

export interface OwnerDescription {
	label: string;
	/** Where the "back" link on the media screen goes. */
	backHref: string;
	backLabel: string;
	/** The public page this media appears on, when there is one. */
	viewHref?: string;
}

/**
 * Resolves an owner to something a person can read.
 *
 * The generic media screen (`/dashboard/media/[ownerType]/[ownerId]`) serves
 * every owner, so it has to be able to say *whose* photographs a staff member
 * is looking at. That is the one thing that genuinely differs per owner type,
 * so it is the one thing enumerated here.
 *
 * Returns null for an owner that does not exist, which the route turns into a
 * 404 — a media screen for a deleted post should not be reachable by URL.
 */
export async function describeOwner(
	ownerType: MediaOwner,
	ownerId: number
): Promise<OwnerDescription | null> {
	switch (ownerType) {
		case 'blog_post': {
			const [row] = await db
				.select({ title: blogPosts.title, slug: blogPosts.slug })
				.from(blogPosts)
				.where(and(eq(blogPosts.id, ownerId), isNull(blogPosts.deletedAt)))
				.limit(1);
			if (!row) return null;
			return {
				label: row.title,
				backHref: `/dashboard/blog/${ownerId}`,
				backLabel: 'Back to the post',
				viewHref: `/blog/${row.slug}`
			};
		}

		case 'pillar': {
			const [row] = await db
				.select({ name: pillars.name, slug: pillars.slug })
				.from(pillars)
				.where(and(eq(pillars.id, ownerId), isNull(pillars.deletedAt)))
				.limit(1);
			if (!row) return null;
			return {
				label: row.name,
				backHref: '/dashboard/pillars',
				backLabel: 'All programmes',
				viewHref: `/programs/${row.slug}`
			};
		}

		case 'initiative': {
			const [row] = await db
				.select({ name: futureInitiatives.name })
				.from(futureInitiatives)
				.where(and(eq(futureInitiatives.id, ownerId), isNull(futureInitiatives.deletedAt)))
				.limit(1);
			if (!row) return null;
			return { label: row.name, backHref: '/dashboard/initiatives', backLabel: 'All initiatives' };
		}

		case 'campaign': {
			const [row] = await db
				.select({ name: donationCampaigns.name })
				.from(donationCampaigns)
				.where(and(eq(donationCampaigns.id, ownerId), isNull(donationCampaigns.deletedAt)))
				.limit(1);
			if (!row) return null;
			return {
				label: row.name,
				backHref: '/dashboard/donation-links',
				backLabel: 'All giving platforms',
				viewHref: '/donate'
			};
		}

		case 'testimonial': {
			const [row] = await db
				.select({ name: testimonials.name })
				.from(testimonials)
				.where(and(eq(testimonials.id, ownerId), isNull(testimonials.deletedAt)))
				.limit(1);
			if (!row) return null;
			return {
				label: row.name,
				backHref: '/dashboard/testimonials',
				backLabel: 'All testimonials',
				viewHref: '/testimonials'
			};
		}

		case 'content_block': {
			const [row] = await db
				.select({ pageId: contentBlocks.pageId, heading: contentBlocks.heading })
				.from(contentBlocks)
				.where(and(eq(contentBlocks.id, ownerId), isNull(contentBlocks.deletedAt)))
				.limit(1);
			if (!row) return null;
			return {
				label: row.heading || 'Page section',
				backHref: `/dashboard/pages/${row.pageId}`,
				backLabel: 'Back to the page'
			};
		}

		// The site-level collections have their own screens and are not reached
		// through the generic route.
		case 'about':
		case 'hero':
		case 'homepage':
			return null;
	}
}

/** Which cache group a write against this owner should drop. */
export const cacheGroupFor = (ownerType: MediaOwner): ContentCacheGroup =>
	(
		({
			about: 'about',
			hero: 'heroGallery',
			homepage: 'homepageGallery',
			blog_post: 'blog',
			pillar: 'pillars',
			initiative: 'initiatives',
			campaign: 'campaigns',
			testimonial: 'testimonials',
			content_block: 'pages'
		}) as const
	)[ownerType];
