import { z } from 'zod/v4';
import { flagField, optionalText, slugField, sortOrderField, moneyField } from '$lib/server/crud';

/** The hospital, the boarding schools, the senior centres — §3.2. */
export const addSchema = z.object({
	slug: slugField,
	name: z.string().trim().min(1, 'Required').max(150),
	description: optionalText(5000),
	icon: z.string().trim().min(1, 'Required').max(60),
	image: z.any().optional(),
	status: z.enum(['planned', 'in_development', 'active']).default('planned'),
	/** Entered in birr, stored in santim. Blank means "no public target". */
	goalAmount: moneyField.optional(),
	currency: z.string().trim().length(3).default('ETB'),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
