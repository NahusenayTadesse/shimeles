import { z } from 'zod/v4';
import {
	flagField,
	optionalIdField,
	optionalText,
	slugField,
	sortOrderField
} from '$lib/server/crud';

/**
 * One place the Foundation physically is.
 *
 * A row rather than the `contact.address` setting, because §1 expects
 * expansion beyond Addis and "our offices" is then a list. The settings keys
 * stay as the fallback for a site with no office rows yet.
 */
export const addSchema = z.object({
	slug: slugField,
	name: z.string().trim().min(1, 'Required').max(120),
	addressLine: optionalText(240),
	city: optionalText(120),
	regionId: optionalIdField,
	phone: optionalText(32),
	email: optionalText(160),
	openingHours: optionalText(200),
	/** Rendered as a link, never as an embed. */
	mapUrl: optionalText(500),
	isPrimary: flagField(false),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
