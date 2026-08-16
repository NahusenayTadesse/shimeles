import { z } from 'zod/v4';
import { flagField, optionalText, slugField, sortOrderField } from '$lib/server/crud';

/**
 * A public page. The body is not here — it lives in `content_blocks`, edited
 * through the block editor at `/dashboard/pages/[id]`, which is what lets
 * staff rewrite a paragraph without touching a template (§3.1).
 */
export const addSchema = z.object({
	slug: slugField,
	title: z.string().trim().min(1, 'Required').max(150),
	metaDescription: optionalText(300),
	shareImage: z.any().optional(),
	isPublished: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
