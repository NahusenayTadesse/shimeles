import { z } from 'zod/v4';
import {
	flagField,
	optionalIdField,
	optionalText,
	slugField,
	sortOrderField
} from '$lib/server/crud';

/**
 * One kind of thing the Foundation will take.
 *
 * The three `requires*` flags are what makes this configuration rather than a
 * label: each one turns on a question the public form asks about an item, so
 * adding "Bicycles" with `requiresTransport` gets the collection warning
 * without a code change. `isAcceptingNow` is the pause switch — the category
 * stays listed, greyed, with its note explaining why, which is kinder than a
 * silent disappearance to somebody who gave last winter.
 */
export const addSchema = z.object({
	slug: slugField,
	name: z.string().trim().min(1, 'Required').max(120),
	description: optionalText(400),
	icon: optionalText(60),
	pillarId: optionalIdField,
	defaultUnit: z.string().trim().min(1).max(32).default('items'),
	requiresExpiry: flagField(false),
	requiresSizing: flagField(false),
	requiresTransport: flagField(false),
	acceptanceNote: optionalText(300),
	isAcceptingNow: flagField(true),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
