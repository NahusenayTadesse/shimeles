import { z } from 'zod/v4';
import { flagField, slugField, sortOrderField } from '$lib/server/crud';

/**
 * A region. v1 operates in Addis Ababa alone, but §1 is explicit that the
 * Foundation plans to expand within two to three years — so every record
 * carries a region now and expansion is a row here rather than a migration.
 */
export const addSchema = z.object({
	slug: slugField,
	name: z.string().trim().min(1, 'Required').max(120),
	isDefault: flagField(false),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
