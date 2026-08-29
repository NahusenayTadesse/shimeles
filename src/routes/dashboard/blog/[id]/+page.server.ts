import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db } from '$lib/server/db';
import { blogPosts } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { invalidateContent } from '$lib/server/content';

import { audit } from '$lib/server/audit';
import {
	listMediaSplit,
	mediaActions,
	mediaVideoActions,
	type MediaScope
} from '$lib/server/media';
import type { Actions, PageServerLoad } from './$types';

/**
 * One post's article and photographs.
 *
 * Split off from the list screen for the same reason the block editor is:
 * the two things here — a long rich-text body and an ordered set of photos —
 * are both a poor fit for a row in a table or a field in a dialog. The
 * post's title, cover and category stay on `/dashboard/blog`.
 *
 * The gallery stores the uploaded filename directly in
 * `blog_gallery_images.image_url`, but the upload still writes a `files` row:
 * `/files/[name]` checks `files.is_public` before it streams a byte, so a
 * photo with no row behind it would 404 on the live site.
 */
/** This post's photographs and videos. */
const scopeFor = (id: number): MediaScope => ({
	ownerType: 'blog_post',
	ownerId: id,
	permission: 'content.manage',
	invalidates: 'blog'
});

/**
 * The owner id comes out of the URL, so the scope is resolved per request —
 * and through `guard`, so the post is confirmed to exist and the permission
 * checked before any media write touches it.
 */
const resolveScope = async (event: RequestEvent) => scopeFor((await guard(event as never)).id);

export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'content.manage');

	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(404, 'Not found');

	const [post] = await db
		.select()
		.from(blogPosts)
		.where(and(eq(blogPosts.id, id), isNull(blogPosts.deletedAt)))
		.limit(1);

	if (!post) throw error(404, 'That post does not exist.');

	const { images: gallery, videos } = await listMediaSplit(scopeFor(id));

	audit({ event, action: 'viewed', entityType: 'blog_post', entityId: id });

	/** `crumb` names this page in the breadcrumb above it. */
	return { crumb: post.title, post, gallery, videos };
};

const bodySchema = z.object({ body: z.string().max(200000).optional() });

/** Resolves the post this request is about, or 404s. */
async function guard(event: Parameters<PageServerLoad>[0]) {
	const access = await requirePermission(event, 'content.manage');
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(404, 'Not found');

	const [post] = await db
		.select({ id: blogPosts.id })
		.from(blogPosts)
		.where(and(eq(blogPosts.id, id), isNull(blogPosts.deletedAt)))
		.limit(1);

	if (!post) throw error(404, 'That post does not exist.');
	return { access, id };
}

export const actions: Actions = {
	saveBody: async (event) => {
		const { access, id } = await guard(event as never);

		const formData = await event.request.formData();
		const parsed = bodySchema.safeParse(Object.fromEntries(formData));
		if (!parsed.success) return fail(400, { error: 'That article is too long to store.' });

		await db
			.update(blogPosts)
			.set({
				body: parsed.data.body?.trim() || '',
				updatedBy: access.userId,
				updatedAt: new Date()
			})
			.where(eq(blogPosts.id, id));

		invalidateContent('blog');
		audit({ event, action: 'updated', entityType: 'blog_post', entityId: id });

		return { ok: true };
	},

	...mediaActions(resolveScope),
	...mediaVideoActions(resolveScope)
};
