import { z } from 'zod/v4';
import {
	flagField,
	optionalIdField,
	optionalText,
	slugField,
	sortOrderField
} from '$lib/server/crud';

/**
 * A blog post's metadata — everything except the article itself, which is
 * written on the post's own screen (`/dashboard/blog/[id]`) because a
 * rich-text editor does not belong in a dialog.
 *
 * `publishedAt` is posted as `YYYY-MM-DD` by the date picker and stored as
 * epoch milliseconds; a blank date is a draft, which is why the transform
 * yields null rather than "now". A date in the future is deliberately
 * allowed — that is how a post is scheduled.
 */
const publishedAtField = z
	.union([z.string(), z.null(), z.undefined()])
	.optional()
	.transform((value) => {
		const raw = typeof value === 'string' ? value.trim() : '';
		if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
		const date = new Date(`${raw}T00:00:00`);
		return Number.isNaN(date.getTime()) ? null : date;
	});

export const addSchema = z.object({
	title: z.string().trim().min(1, 'Required').max(200),
	slug: slugField,
	excerpt: optionalText(600),
	coverImage: z.any().optional(),
	categoryId: optionalIdField,
	authorName: optionalText(120),
	metaDescription: optionalText(300),
	/** 0 means "estimate it from the body" — see `estimateReadMinutes`. */
	readMinutes: z.coerce.number().int().min(0).max(180).default(0),
	publishedAt: publishedAtField,
	isFeatured: flagField(false),
	isPublished: flagField(true),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
