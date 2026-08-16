import { z } from 'zod/v4';
import {
	flagField,
	optionalIdField,
	optionalText,
	slugField,
	sortOrderField
} from '$lib/server/crud';

/**
 * A form definition.
 *
 * `isLowBarrier` deserves a note: ticking it is not cosmetic. The schema
 * generator refuses to mark any contact field or document upload as required
 * on a low-barrier form, whatever the individual questions say — so the
 * Mental Wellness promise cannot be broken by someone later ticking
 * "required" on a phone number.
 */
export const addSchema = z.object({
	slug: slugField,
	name: z.string().trim().min(1, 'Required').max(150),
	pillarId: optionalIdField,
	title: z.string().trim().min(1, 'Required').max(200),
	introText: optionalText(3000),
	successMessage: optionalText(1000),
	requiresDocuments: flagField(false),
	isLowBarrier: flagField(false),
	referencePrefix: z
		.string()
		.trim()
		.min(1, 'Required')
		.max(6)
		.regex(/^[A-Za-z0-9]+$/, 'Letters and numbers only')
		.transform((value) => value.toUpperCase()),
	statusContext: z.enum(['application', 'volunteer']).default('application'),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
