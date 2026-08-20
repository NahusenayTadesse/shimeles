import { z } from 'zod/v4';
import { flagField, optionalText, slugField, sortOrderField } from '$lib/server/crud';

/** A heading on the public skills list. Presentation only — no rules key off it. */
export const addSchema = z.object({
	slug: slugField,
	name: z.string().trim().min(1, 'Required').max(120),
	description: optionalText(400),
	/** A Lucide icon name, resolved by `dynamic-icon.svelte`. */
	icon: optionalText(60),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
