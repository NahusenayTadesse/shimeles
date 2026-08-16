import { z } from 'zod/v4';
import { flagField, optionalText, slugField, sortOrderField } from '$lib/server/crud';

/** How money can reach the Foundation. CBE is not the only bank. */
export const addSchema = z.object({
	slug: slugField,
	name: z.string().trim().min(1, 'Required').max(120),
	kind: z
		.enum(['bank_transfer', 'mobile_money', 'card', 'paypal', 'cash'])
		.default('bank_transfer'),
	logo: z.any().optional(),
	instructions: optionalText(1000),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
