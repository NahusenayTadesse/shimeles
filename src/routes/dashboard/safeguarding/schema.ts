import { z } from 'zod/v4';
import { flagField, optionalText, sortOrderField } from '$lib/server/crud';

/**
 * One safeguarding check.
 *
 * Adding an item here immediately makes every previously-complete volunteer
 * application incomplete again, and therefore un-approvable until the new check
 * is done. That is deliberate: a safeguarding requirement that only applies to
 * future volunteers is not a safeguarding requirement.
 */
export const addSchema = z.object({
	label: z.string().trim().min(1, 'Required').max(200),
	description: optionalText(600),
	professionalOnly: flagField(false),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
