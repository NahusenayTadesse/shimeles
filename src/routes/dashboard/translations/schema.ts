import { z } from 'zod/v4';
import { flagField, optionalText } from '$lib/server/crud';

/**
 * A short UI string. These are read through the cached `t(key)` helper rather
 * than a static i18n file, precisely so fixing a mistranslated button is a
 * dashboard edit and not a deploy (§3.1).
 */
export const addSchema = z.object({
	key: z
		.string()
		.trim()
		.min(1, 'Required')
		.max(120)
		.regex(/^[a-z0-9_.]+$/, 'Lower-case letters, numbers, dots and underscores only'),
	en: z.string().trim().min(1, 'Required').max(1000),
	am: optionalText(1000),
	group: z.string().trim().min(1, 'Required').max(60).default('general'),
	isActive: flagField(true)
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
