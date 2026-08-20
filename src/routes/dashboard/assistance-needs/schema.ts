import { z } from 'zod/v4';
import {
	flagField,
	optionalIdField,
	optionalText,
	slugField,
	sortOrderField
} from '$lib/server/crud';

/**
 * One kind of help someone can ask for on `/apply`.
 *
 * The pillar is the routing: an application that names this need is filed
 * against that programme, so an applicant never has to work out which of the
 * four owns their problem. Leave it blank and the need shows under every
 * programme and routes nowhere on its own.
 */
export const addSchema = z.object({
	slug: slugField,
	name: z.string().trim().min(1, 'Required').max(120),
	description: optionalText(400),
	categoryId: optionalIdField,
	pillarId: optionalIdField,
	evidenceHint: optionalText(200),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
