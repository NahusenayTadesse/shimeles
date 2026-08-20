import { z } from 'zod/v4';
import { flagField, optionalText, slugField, sortOrderField } from '$lib/server/crud';

/**
 * A profession a volunteer can claim a licence in.
 *
 * These rows are what the credential-verification gate is about: a volunteer
 * who names one of them cannot be approved or placed until staff have checked
 * the licence with the issuing body (§3.6). Adding a profession is safe;
 * marking one as not needing a licence is the decision to think about.
 */
export const addSchema = z.object({
	slug: slugField,
	name: z.string().trim().min(1, 'Required').max(120),
	category: z
		.enum(['medical', 'mental_health', 'allied_health', 'public_health', 'other'])
		.default('medical'),
	requiresLicense: flagField(true),
	defaultLicensingBody: optionalText(160),
	description: optionalText(400),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
