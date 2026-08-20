import { z } from 'zod/v4';
import { flagField, optionalText, slugField, sortOrderField } from '$lib/server/crud';

/**
 * A language an applicant may write in.
 *
 * Note this is not the site's UI language — v1 renders in English only and
 * that is deliberate. This is the list someone picks from when they are told
 * to write in whatever language they are comfortable in, so the case reaches a
 * caseworker who can read it.
 */
export const addSchema = z.object({
	slug: slugField,
	name: z.string().trim().min(1, 'Required').max(120),
	/** The language's own name — what the applicant is shown. */
	nativeName: optionalText(120),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
