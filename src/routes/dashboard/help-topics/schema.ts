import { z } from 'zod/v4';
import { flagField, optionalText, sortOrderField } from '$lib/server/crud';

/**
 * One question the help panel on a public page answers.
 *
 * Amharic is optional on purpose. The panel offers the language switch only
 * once something has been translated, so a half-finished translation shows
 * nobody a button that leads to blank answers — and a fundraiser can write the
 * English today and come back to the Amharic.
 */
export const addSchema = z.object({
	context: z
		.string()
		.trim()
		.min(1, 'Required')
		.max(40)
		.regex(/^[a-z0-9_-]+$/, 'Lower-case letters, numbers, hyphens and underscores only')
		.default('donate'),
	question: z.string().trim().min(1, 'Required').max(300),
	questionAm: optionalText(300),
	answer: z.string().trim().min(1, 'Required').max(2000),
	answerAm: optionalText(2000),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
