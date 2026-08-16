import { fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db } from '$lib/server/db';
import { aboutContent, aboutGalleryImages, files } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { invalidateContent } from '$lib/server/content';
import { savePublicImage, deleteStoredFile } from '$lib/server/upload';
import { audit } from '$lib/server/audit';
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
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'content.manage');

	const [content] = await db.select().from(aboutContent).limit(1);

	const gallery = await db
		.select({
			id: aboutGalleryImages.id,
			caption: aboutGalleryImages.caption,
			storagePath: files.storagePath
		})
		.from(aboutGalleryImages)
		.innerJoin(files, eq(files.id, aboutGalleryImages.fileId))
		.orderBy(asc(aboutGalleryImages.sortOrder), asc(aboutGalleryImages.id));

	audit({ event, action: 'viewed', entityType: 'about_content', entityId: content?.id ?? null });

	return { content: content ?? null, gallery };
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
		audit({ event, action: 'updated', entityType: 'about_content', entityId: existing?.id ?? null });

		return { ok: true };
	},

	addGalleryImages: async (event) => {
		const access = await guard(event as never);
		const formData = await event.request.formData();
		const uploads = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);

		if (!uploads.length) return fail(400, { error: 'Choose at least one photo.' });

		const existingCount = (await db.select({ id: aboutGalleryImages.id }).from(aboutGalleryImages))
			.length;

		let sortOrder = existingCount;
		for (const upload of uploads) {
			const saved = await savePublicImage(upload, access.userId);
			const [fileRow] = await db
				.select({ id: files.id })
				.from(files)
				.where(eq(files.storagePath, saved))
				.limit(1);
			if (!fileRow) continue;

			await db.insert(aboutGalleryImages).values({
				fileId: fileRow.id,
				sortOrder: sortOrder++,
				createdAt: new Date()
			});
		}

		invalidateContent('about');
		audit({ event, action: 'created', entityType: 'about_gallery_image', entityId: null });

		return { ok: true };
	},

	updateGalleryCaption: async (event) => {
		await guard(event as never);
		const formData = await event.request.formData();
		const imageId = Number(formData.get('imageId'));
		const caption = String(formData.get('caption') ?? '').trim();

		if (!Number.isFinite(imageId)) return fail(400, { error: 'Unknown photo.' });

		await db
			.update(aboutGalleryImages)
			.set({ caption: caption || null })
			.where(eq(aboutGalleryImages.id, imageId));

		invalidateContent('about');
		audit({ event, action: 'updated', entityType: 'about_gallery_image', entityId: imageId });

		return { ok: true };
	},

	deleteGalleryImage: async (event) => {
		await guard(event as never);
		const formData = await event.request.formData();
		const imageId = Number(formData.get('imageId'));
		if (!Number.isFinite(imageId)) return fail(400, { error: 'Unknown photo.' });

		const [row] = await db
			.select({ fileId: aboutGalleryImages.fileId })
			.from(aboutGalleryImages)
			.where(eq(aboutGalleryImages.id, imageId))
			.limit(1);

		await db.delete(aboutGalleryImages).where(eq(aboutGalleryImages.id, imageId));
		if (row) await deleteStoredFile(row.fileId);

		invalidateContent('about');
		audit({ event, action: 'deleted', entityType: 'about_gallery_image', entityId: imageId });

		return { ok: true };
	},

	reorderGallery: async (event) => {
		await guard(event as never);
		const formData = await event.request.formData();
		const order = String(formData.get('order') ?? '')
			.split(',')
			.map(Number)
			.filter(Number.isFinite);

		if (order.length === 0) return fail(400, { error: 'Nothing to reorder.' });

		db.transaction((tx) => {
			order.forEach((imageId, index) => {
				tx.update(aboutGalleryImages)
					.set({ sortOrder: index })
					.where(eq(aboutGalleryImages.id, imageId))
					.run();
			});
		});

		invalidateContent('about');
		audit({ event, action: 'updated', entityType: 'about_gallery_image', entityId: null });

		return { ok: true };
	}
};
