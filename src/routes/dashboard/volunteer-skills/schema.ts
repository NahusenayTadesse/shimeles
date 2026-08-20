import { z } from 'zod/v4';
import {
	flagField,
	optionalIdField,
	optionalText,
	slugField,
	sortOrderField
} from '$lib/server/crud';

/**
 * One skill a volunteer can claim.
 *
 * Adding a row here puts a new tick-box on `/volunteer` on the next request,
 * and makes "who can do this?" a `where` clause rather than a search through
 * free text. That is the whole reason the catalogue exists (§0): the Foundation
 * starting to run, say, a hearing clinic should be a row, not a deploy.
 */
export const addSchema = z.object({
	slug: slugField,
	name: z.string().trim().min(1, 'Required').max(120),
	categoryId: optionalIdField,
	hint: optionalText(300),
	description: optionalText(600),
	/**
	 * Ticking this skill on the public form obliges the applicant to enter a
	 * licence, and puts them behind the credential-verification gate. Reserve it
	 * for work that is genuinely regulated.
	 */
	requiresCredential: flagField(false),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
