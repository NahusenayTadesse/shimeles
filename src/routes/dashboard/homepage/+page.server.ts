import { fail } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { files, heroGalleryImages, homepageGalleryImages } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { invalidateContent } from '$lib/server/content';
import { savePublicImage, deleteStoredFile } from '$lib/server/upload';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * The homepage editor — two independent photo sets, same CRUD pattern twice:
 * the hero gallery the header rotates through (still falls back to the
 * `hero.image` setting — see `+page.svelte`), and a general gallery section
 * further down the page. Same shape as the About page's In Memoriam gallery.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'content.manage');

	const [gallery, homepageGallery] = await Promise.all([
		db
			.select({
				id: heroGalleryImages.id,
				caption: heroGalleryImages.caption,
				storagePath: files.storagePath
			})
			.from(heroGalleryImages)
			.innerJoin(files, eq(files.id, heroGalleryImages.fileId))
			.orderBy(asc(heroGalleryImages.sortOrder), asc(heroGalleryImages.id)),
		db
			.select({
				id: homepageGalleryImages.id,
				caption: homepageGalleryImages.caption,
				storagePath: files.storagePath
			})
			.from(homepageGalleryImages)
			.innerJoin(files, eq(files.id, homepageGalleryImages.fileId))
			.orderBy(asc(homepageGalleryImages.sortOrder), asc(homepageGalleryImages.id))
	]);

	audit({ event, action: 'viewed_list', entityType: 'hero_gallery_image' });
	audit({ event, action: 'viewed_list', entityType: 'homepage_gallery_image' });

	return { gallery, homepageGallery };
};

async function guard(event: Parameters<PageServerLoad>[0]) {
	return requirePermission(event, 'content.manage');
}

export const actions: Actions = {
	addGalleryImages: async (event) => {
		const access = await guard(event as never);
		const formData = await event.request.formData();
		const uploads = formData
			.getAll('images')
			.filter((f): f is File => f instanceof File && f.size > 0);

		if (!uploads.length) return fail(400, { error: 'Choose at least one photo.' });

		const existingCount = (await db.select({ id: heroGalleryImages.id }).from(heroGalleryImages))
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

			await db.insert(heroGalleryImages).values({
				fileId: fileRow.id,
				sortOrder: sortOrder++,
				createdAt: new Date()
			});
		}

		invalidateContent('heroGallery');
		audit({ event, action: 'created', entityType: 'hero_gallery_image', entityId: null });

		return { ok: true };
	},

	updateGalleryCaption: async (event) => {
		await guard(event as never);
		const formData = await event.request.formData();
		const imageId = Number(formData.get('imageId'));
		const caption = String(formData.get('caption') ?? '').trim();

		if (!Number.isFinite(imageId)) return fail(400, { error: 'Unknown photo.' });

		await db
			.update(heroGalleryImages)
			.set({ caption: caption || null })
			.where(eq(heroGalleryImages.id, imageId));

		invalidateContent('heroGallery');
		audit({ event, action: 'updated', entityType: 'hero_gallery_image', entityId: imageId });

		return { ok: true };
	},

	deleteGalleryImage: async (event) => {
		await guard(event as never);
		const formData = await event.request.formData();
		const imageId = Number(formData.get('imageId'));
		if (!Number.isFinite(imageId)) return fail(400, { error: 'Unknown photo.' });

		const [row] = await db
			.select({ fileId: heroGalleryImages.fileId })
			.from(heroGalleryImages)
			.where(eq(heroGalleryImages.id, imageId))
			.limit(1);

		await db.delete(heroGalleryImages).where(eq(heroGalleryImages.id, imageId));
		if (row) await deleteStoredFile(row.fileId);

		invalidateContent('heroGallery');
		audit({ event, action: 'deleted', entityType: 'hero_gallery_image', entityId: imageId });

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
				tx.update(heroGalleryImages)
					.set({ sortOrder: index })
					.where(eq(heroGalleryImages.id, imageId))
					.run();
			});
		});

		invalidateContent('heroGallery');
		audit({ event, action: 'updated', entityType: 'hero_gallery_image', entityId: null });

		return { ok: true };
	},

	addHomepageGalleryImages: async (event) => {
		const access = await guard(event as never);
		const formData = await event.request.formData();
		const uploads = formData
			.getAll('images')
			.filter((f): f is File => f instanceof File && f.size > 0);

		if (!uploads.length) return fail(400, { error: 'Choose at least one photo.' });

		const existingCount = (
			await db.select({ id: homepageGalleryImages.id }).from(homepageGalleryImages)
		).length;

		let sortOrder = existingCount;
		for (const upload of uploads) {
			const saved = await savePublicImage(upload, access.userId);
			const [fileRow] = await db
				.select({ id: files.id })
				.from(files)
				.where(eq(files.storagePath, saved))
				.limit(1);
			if (!fileRow) continue;

			await db.insert(homepageGalleryImages).values({
				fileId: fileRow.id,
				sortOrder: sortOrder++,
				createdAt: new Date()
			});
		}

		invalidateContent('homepageGallery');
		audit({ event, action: 'created', entityType: 'homepage_gallery_image', entityId: null });

		return { ok: true };
	},

	updateHomepageGalleryCaption: async (event) => {
		await guard(event as never);
		const formData = await event.request.formData();
		const imageId = Number(formData.get('imageId'));
		const caption = String(formData.get('caption') ?? '').trim();

		if (!Number.isFinite(imageId)) return fail(400, { error: 'Unknown photo.' });

		await db
			.update(homepageGalleryImages)
			.set({ caption: caption || null })
			.where(eq(homepageGalleryImages.id, imageId));

		invalidateContent('homepageGallery');
		audit({ event, action: 'updated', entityType: 'homepage_gallery_image', entityId: imageId });

		return { ok: true };
	},

	deleteHomepageGalleryImage: async (event) => {
		await guard(event as never);
		const formData = await event.request.formData();
		const imageId = Number(formData.get('imageId'));
		if (!Number.isFinite(imageId)) return fail(400, { error: 'Unknown photo.' });

		const [row] = await db
			.select({ fileId: homepageGalleryImages.fileId })
			.from(homepageGalleryImages)
			.where(eq(homepageGalleryImages.id, imageId))
			.limit(1);

		await db.delete(homepageGalleryImages).where(eq(homepageGalleryImages.id, imageId));
		if (row) await deleteStoredFile(row.fileId);

		invalidateContent('homepageGallery');
		audit({ event, action: 'deleted', entityType: 'homepage_gallery_image', entityId: imageId });

		return { ok: true };
	},

	reorderHomepageGallery: async (event) => {
		await guard(event as never);
		const formData = await event.request.formData();
		const order = String(formData.get('order') ?? '')
			.split(',')
			.map(Number)
			.filter(Number.isFinite);

		if (order.length === 0) return fail(400, { error: 'Nothing to reorder.' });

		db.transaction((tx) => {
			order.forEach((imageId, index) => {
				tx.update(homepageGalleryImages)
					.set({ sortOrder: index })
					.where(eq(homepageGalleryImages.id, imageId))
					.run();
			});
		});

		invalidateContent('homepageGallery');
		audit({ event, action: 'updated', entityType: 'homepage_gallery_image', entityId: null });

		return { ok: true };
	}
};
