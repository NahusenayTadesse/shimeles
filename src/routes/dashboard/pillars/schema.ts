import { z } from 'zod/v4';
import { flagField, optionalText, slugField, sortOrderField } from '$lib/server/crud';

/**
 * A pillar.
 *
 * Nothing about the four seeded pillars is special — this schema is what a
 * program manager uses to add a fifth from the dashboard, which §3.2 requires
 * to be possible without a code change.
 */
export const addSchema = z.object({
	slug: slugField,
	name: z.string().trim().min(1, 'Required').max(120),
	summary: optionalText(300),
	description: optionalText(20000),
	icon: z.string().trim().min(1, 'Required').max(60),
	color: z.enum(['clay', 'olive', 'plum', 'sky']).default('clay'),
	image: z.any().optional(),
	hasPublicApplication: flagField(true),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
