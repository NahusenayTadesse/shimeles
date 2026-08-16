import { z } from 'zod/v4';
import { flagField, idField, optionalText, sortOrderField } from '$lib/server/crud';

/**
 * The account numbers shown on the Donate page.
 *
 * Note what is *not* here: no API keys, no secrets. §7 keeps payment provider
 * credentials in environment variables, never in the database — a bank account
 * number is public information, an API key is not.
 */
export const addSchema = z.object({
	paymentMethodId: idField,
	accountName: z.string().trim().min(1, 'Required').max(150),
	accountNumber: z.string().trim().min(1, 'Required').max(100),
	bankName: optionalText(150),
	branch: optionalText(150),
	swiftCode: optionalText(20),
	currency: z.string().trim().length(3).default('ETB'),
	isForDiaspora: flagField(false),
	instructions: optionalText(600),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
