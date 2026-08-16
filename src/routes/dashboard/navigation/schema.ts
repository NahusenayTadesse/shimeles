import { z } from 'zod/v4';
import { flagField, optionalIdField, optionalText, sortOrderField } from '$lib/server/crud';

/** A header or footer link. Either points at a page, or at a raw URL. */
export const addSchema = z.object({
	label: z.string().trim().min(1, 'Required').max(80),
	pageId: optionalIdField,
	url: optionalText(300),
	placement: z.enum(['header', 'footer', 'both']).default('header'),
	parentId: optionalIdField,
	isCta: flagField(false),
	isVisible: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
