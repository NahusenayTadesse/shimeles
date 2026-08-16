import { z } from 'zod/v4';
import { flagField, optionalIdField, optionalText } from '$lib/server/crud';

/** A family unit, so returning households are recognised rather than re-entered. */
export const addSchema = z.object({
	label: z.string().trim().min(1, 'Required').max(150),
	regionId: optionalIdField,
	notes: optionalText(2000),
	isActive: flagField(true)
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
