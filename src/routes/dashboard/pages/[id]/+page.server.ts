import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db } from '$lib/server/db';
import { contentBlocks, pages } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { invalidateContent } from '$lib/server/content';
import { savePublicImage } from '$lib/server/upload';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * The block editor.
 *
 * §5.1 flags this as worth a purpose-built screen, and the reason is ordering:
 * a page's body is a sequence, and a generic table cannot express "move this
 * paragraph above that image" in a way anyone enjoys using.
 *
 * Each block type has its own `content` JSON contract, documented in
 * `BlockRenderer`. This route validates against those contracts per type
 * rather than storing whatever JSON arrives — a malformed block would render
 * as a blank section on the live site with no clue why.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'content.manage');
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(404, 'Not found');

	const [page] = await db
		.select()
		.from(pages)
		.where(and(eq(pages.id, id), isNull(pages.deletedAt)))
		.limit(1);

	if (!page) throw error(404, 'That page does not exist.');

	const blocks = await db
		.select()
		.from(contentBlocks)
		.where(and(eq(contentBlocks.pageId, id), isNull(contentBlocks.deletedAt)))
		.orderBy(asc(contentBlocks.sortOrder), asc(contentBlocks.id));

	audit({ event, action: 'viewed', entityType: 'page', entityId: id });

	return { page, blocks };
};

const BLOCK_TYPES = [
	'rich_text',
	'image',
	'stat_counter',
	'quote',
	'cta_button',
	'pillar_grid',
	'values_list',
	'initiative_grid',
	'form_embed',
	'donation_details',
	'memoriam',
	'gallery',
	'video',
	'testimonial_slider'
] as const;

const blockSchema = z.object({
	blockType: z.enum(BLOCK_TYPES),
	heading: z.string().trim().max(200).optional(),
	isPublished: z.coerce.boolean().default(true),
	/** Everything type-specific arrives as loose form fields, parsed below. */
	body: z.string().max(50000).optional(),
	text: z.string().max(2000).optional(),
	attribution: z.string().max(200).optional(),
	label: z.string().max(200).optional(),
	url: z.string().max(500).optional(),
	variant: z.string().max(30).optional(),
	note: z.string().max(500).optional(),
	alt: z.string().max(300).optional(),
	caption: z.string().max(500).optional(),
	slug: z.string().max(120).optional(),
	/** `stats` and `values` are edited as JSON — they are lists of objects. */
	json: z.string().max(20000).optional(),
	/** In Memoriam only. */
	name: z.string().max(150).optional(),
	linkHref: z.string().max(300).optional(),
	linkLabel: z.string().max(100).optional()
});

/** Builds the per-type `content` object from the flat form payload. */
async function buildContent(
	blockType: string,
	data: z.infer<typeof blockSchema>,
	image: File | null,
	existing: Record<string, unknown> | null,
	userId: string
): Promise<{ content: Record<string, unknown>; error?: string }> {
	const trim = (value?: string) => (value?.trim() ? value.trim() : undefined);

	switch (blockType) {
		case 'rich_text':
			return { content: { body: trim(data.body) ?? '' } };

		case 'image': {
			// Keep the stored image when no new one was chosen — re-uploading just
			// to fix a caption would be absurd.
			const src =
				image && image.size > 0
					? await savePublicImage(image, userId)
					: (existing?.src as string | undefined);
			if (!src) return { content: {}, error: 'Choose an image.' };
			return {
				content: { src, alt: trim(data.alt) ?? '', caption: trim(data.caption) }
			};
		}

		case 'quote':
			return {
				content: {
					text: trim(data.text) ?? '',
					attribution: trim(data.attribution)
				}
			};

		case 'cta_button':
			return {
				content: {
					label: trim(data.label) ?? 'Learn more',
					url: trim(data.url) ?? '/',
					variant: trim(data.variant) ?? 'default',
					note: trim(data.note)
				}
			};

		case 'form_embed':
			if (!trim(data.slug)) return { content: {}, error: 'Which form should this link to?' };
			return { content: { slug: trim(data.slug), label: trim(data.label) ?? '' } };

		case 'stat_counter':
		case 'values_list': {
			const key = blockType === 'stat_counter' ? 'stats' : 'values';
			if (!trim(data.json)) return { content: { [key]: [] } };
			try {
				const parsed = JSON.parse(data.json!);
				if (!Array.isArray(parsed)) return { content: {}, error: 'That should be a JSON list.' };
				return { content: { [key]: parsed } };
			} catch {
				return { content: {}, error: 'That is not valid JSON.' };
			}
		}

		case 'memoriam': {
			if (!trim(data.body)) return { content: {}, error: 'Write the tribute text.' };
			// The photo is optional and, like the image block, only re-uploaded
			// when a new file is actually chosen.
			const photo =
				image && image.size > 0
					? await savePublicImage(image, userId)
					: (existing?.photo as string | undefined);
			return {
				content: {
					name: trim(data.name) ?? '',
					photo: photo ?? null,
					body: trim(data.body) ?? '',
					linkHref: trim(data.linkHref),
					linkLabel: trim(data.linkLabel)
				}
			};
		}

		// These read entirely from their own tables — `pillars`,
		// `future_initiatives`, `payment_accounts` — so the block carries no copy.
		case 'pillar_grid':
			return { content: { show_apply_links: true } };
		case 'initiative_grid':
		case 'donation_details':
		default:
			return { content: {} };
	}
}

async function guard(event: Parameters<PageServerLoad>[0]) {
	const access = await requirePermission(event, 'content.manage');
	const id = Number(event.params.id);

	const [page] = await db.select({ id: pages.id }).from(pages).where(eq(pages.id, id)).limit(1);
	if (!page) throw error(404, 'That page does not exist.');

	return { access, pageId: page.id };
}

export const actions: Actions = {
	addBlock: async (event) => {
		const { access, pageId } = await guard(event as never);
		const formData = await event.request.formData();
		const parsed = blockSchema.safeParse(Object.fromEntries(formData));

		if (!parsed.success) return fail(400, { error: 'Check the block details.' });

		const image = formData.get('image');
		const { content, error: contentError } = await buildContent(
			parsed.data.blockType,
			parsed.data,
			image instanceof File ? image : null,
			null,
			access.userId
		);
		if (contentError) return fail(400, { error: contentError });

		const [{ next }] = await db
			.select({ next: sql<number>`coalesce(max(sort_order), -1) + 1` })
			.from(contentBlocks)
			.where(eq(contentBlocks.pageId, pageId));

		await db.insert(contentBlocks).values({
			pageId,
			blockType: parsed.data.blockType,
			heading: parsed.data.heading || null,
			content,
			isPublished: parsed.data.isPublished,
			sortOrder: next,
			createdBy: access.userId,
			updatedBy: access.userId
		});

		invalidateContent('pages');
		audit({ event, action: 'created', entityType: 'content_block', entityId: pageId });

		return { ok: true };
	},

	updateBlock: async (event) => {
		const { access, pageId } = await guard(event as never);
		const formData = await event.request.formData();
		const blockId = Number(formData.get('blockId'));
		const parsed = blockSchema.safeParse(Object.fromEntries(formData));

		if (!Number.isFinite(blockId) || !parsed.success) {
			return fail(400, { error: 'Check the block details.' });
		}

		const [existing] = await db
			.select({ content: contentBlocks.content })
			.from(contentBlocks)
			.where(and(eq(contentBlocks.id, blockId), eq(contentBlocks.pageId, pageId)))
			.limit(1);

		if (!existing) return fail(404, { error: 'That block no longer exists.' });

		const image = formData.get('image');
		const { content, error: contentError } = await buildContent(
			parsed.data.blockType,
			parsed.data,
			image instanceof File ? image : null,
			existing.content,
			access.userId
		);
		if (contentError) return fail(400, { error: contentError });

		await db
			.update(contentBlocks)
			.set({
				blockType: parsed.data.blockType,
				heading: parsed.data.heading || null,
				content,
				isPublished: parsed.data.isPublished,
				updatedBy: access.userId,
				updatedAt: new Date()
			})
			.where(eq(contentBlocks.id, blockId));

		invalidateContent('pages');
		audit({ event, action: 'updated', entityType: 'content_block', entityId: blockId });

		return { ok: true };
	},

	deleteBlock: async (event) => {
		const { access, pageId } = await guard(event as never);
		const formData = await event.request.formData();
		const blockId = Number(formData.get('blockId'));

		if (!Number.isFinite(blockId)) return fail(400, { error: 'Unknown block.' });

		await db
			.update(contentBlocks)
			.set({ deletedAt: new Date(), deletedBy: access.userId })
			.where(and(eq(contentBlocks.id, blockId), eq(contentBlocks.pageId, pageId)));

		invalidateContent('pages');
		audit({ event, action: 'deleted', entityType: 'content_block', entityId: blockId });

		return { ok: true };
	},

	reorder: async (event) => {
		const { pageId } = await guard(event as never);
		const formData = await event.request.formData();
		const order = String(formData.get('order') ?? '')
			.split(',')
			.map(Number)
			.filter(Number.isFinite);

		if (order.length === 0) return fail(400, { error: 'Nothing to reorder.' });

		db.transaction((tx) => {
			order.forEach((blockId, index) => {
				tx.update(contentBlocks)
					.set({ sortOrder: index })
					.where(and(eq(contentBlocks.id, blockId), eq(contentBlocks.pageId, pageId)))
					.run();
			});
		});

		invalidateContent('pages');
		audit({
			event,
			action: 'updated',
			entityType: 'page',
			entityId: pageId,
			metadata: { reordered: true }
		});

		return { ok: true };
	}
};
