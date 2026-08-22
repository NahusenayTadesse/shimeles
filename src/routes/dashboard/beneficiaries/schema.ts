import { z } from 'zod/v4';
import { flagField, optionalIdField, optionalText } from '$lib/server/crud';
import { PERSON_GENDERS } from '$lib/gender';

/**
 * A beneficiary.
 *
 * Every contact field is optional, including the name in practice: a Mental
 * Wellness applicant may legitimately withhold all of it, and a schema that
 * insisted otherwise would quietly break the low-barrier promise the moment a
 * caseworker tried to record them.
 */
export const addSchema = z.object({
	fullName: z.string().trim().min(1, 'Required').max(150),
	phone: optionalText(32),
	email: optionalText(180),
	householdId: optionalIdField,
	regionId: optionalIdField,
	dateOfBirth: optionalText(10),
	gender: z.enum(PERSON_GENDERS).default('prefer_not_to_say'),
	notes: optionalText(5000),
	isActive: flagField(true)
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
