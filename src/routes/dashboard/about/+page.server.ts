import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db } from '$lib/server/db';
import { aboutContent } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { invalidateContent } from '$lib/server/content';
import { savePublicImage } from '$lib/server/upload';
import { audit } from '$lib/server/audit';
import {
	listMediaSplit,
	mediaActions,
	mediaVideoActions,
	type MediaScope
} from '$lib/server/media';
import type { Actions, PageServerLoad } from './$types';

/**
 * The About page editor.
 *
 * `/about` is a hand-built route (see the note at the top of `schema.ts`)
 * rather than a `content_blocks` page, but the paragraphs and photos on it
 * are still a program manager's to rewrite — this screen is where. There is
 * exactly one `about_content` row; this screen creates it on first save
 * rather than requiring a migration to seed one.
 */
/**
 * The About page's media — the In Memoriam photographs and the page's videos.
 *
 * `about_content` is a singleton, so its owner id is fixed at 1. This screen
 * keeps its own media controls rather than linking to the shared media route,
 * because here the photographs are one part of a larger editor rather than
 * the whole point of the page.
 */
const galleryScope: MediaScope = {
	ownerType: 'about',
	ownerId: 1,
	permission: 'content.manage',
	invalidates: 'about'
};

export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'content.manage');

	const [content] = await db.select().from(aboutContent).limit(1);

	const { images: gallery, videos } = await listMediaSplit(galleryScope);

	audit({ event, action: 'viewed', entityType: 'about_content', entityId: content?.id ?? null });

	return { content: content ?? null, gallery, videos };
};

const contentSchema = z.object({
	metaDescription: z.string().trim().max(300).optional(),
	storyBody: z.string().max(20000).optional(),
	missionText: z.string().trim().max(3000).optional(),
	visionText: z.string().trim().max(3000).optional(),
	memoriamName: z.string().trim().max(150).optional(),
	memoriamBody: z.string().max(20000).optional()
});

async function guard(event: Parameters<PageServerLoad>[0]) {
	return requirePermission(event, 'content.manage');
}

export const actions: Actions = {
	saveContent: async (event) => {
		const access = await guard(event as never);
		const formData = await event.request.formData();
		const parsed = contentSchema.safeParse(Object.fromEntries(formData));
		if (!parsed.success) return fail(400, { error: 'Check the fields above.' });

		const [existing] = await db.select().from(aboutContent).limit(1);

		const heroFile = formData.get('heroImage');
		const memoriamFile = formData.get('memoriamHeroImage');

		const heroImage =
			heroFile instanceof File && heroFile.size > 0
				? await savePublicImage(heroFile, access.userId)
				: (existing?.heroImage ?? null);

		const memoriamHeroImage =
			memoriamFile instanceof File && memoriamFile.size > 0
				? await savePublicImage(memoriamFile, access.userId)
				: (existing?.memoriamHeroImage ?? null);

		const values = {
			metaDescription: parsed.data.metaDescription?.trim() || null,
			heroImage,
			storyBody: parsed.data.storyBody?.trim() || '',
			missionText: parsed.data.missionText?.trim() || '',
			visionText: parsed.data.visionText?.trim() || '',
			memoriamName: parsed.data.memoriamName?.trim() || 'Shimeles Abera',
			memoriamHeroImage,
			memoriamBody: parsed.data.memoriamBody?.trim() || '',
			updatedBy: access.userId,
			updatedAt: new Date()
		};

		if (existing) {
			await db.update(aboutContent).set(values).where(eq(aboutContent.id, existing.id));
		} else {
			await db.insert(aboutContent).values(values);
		}

		invalidateContent('about');
		audit({
			event,
			action: 'updated',
			entityType: 'about_content',
			entityId: existing?.id ?? null
		});

		return { ok: true };
	},

	...mediaActions(() => galleryScope),
	...mediaVideoActions(() => galleryScope)
};
