import { z } from 'zod/v4';
import { flagField, optionalText, slugField, sortOrderField } from '$lib/server/crud';

/** The editable list behind the blog's filter chips. */
export const addSchema = z.object({
	slug: slugField,
	name: z.string().trim().min(1, 'Required').max(120),
	description: optionalText(500),
	/** Accent token, same vocabulary as a pillar's. */
	color: z.enum(['clay', 'olive', 'plum', 'sky']).default('olive'),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
