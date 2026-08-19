import { z } from 'zod/v4';
import {
	flagField,
	optionalIdField,
	optionalText,
	slugField,
	sortOrderField
} from '$lib/server/crud';

/**
 * A testimonial.
 *
 * Two independent flags, because they answer different questions: `showOnSite`
 * puts it on `/testimonials`, `isFeatured` puts it in the homepage slider. A
 * quote can be on the wall without being on the front page, which is the
 * common case.
 */
export const addSchema = z.object({
	name: z.string().trim().min(1, 'Required').max(150),
	slug: slugField,
	role: optionalText(150),
	quote: z.string().trim().min(1, 'Required').max(600),
	body: optionalText(20000),
	photo: z.any().optional(),
	pillarId: optionalIdField,
	showOnSite: flagField(true),
	isFeatured: flagField(false),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
