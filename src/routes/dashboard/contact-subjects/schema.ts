import { z } from 'zod/v4';
import {
	flagField,
	optionalIdField,
	optionalText,
	slugField,
	sortOrderField
} from '$lib/server/crud';

/**
 * One enquiry topic, and where messages on it go.
 *
 * This row is the routing. Changing who is emailed about press enquiries is an
 * edit here, not a code change and not a rule buried in a notification
 * function (§0).
 */
export const addSchema = z.object({
	slug: slugField,
	name: z.string().trim().min(1, 'Required').max(120),
	description: optionalText(400),
	/** A Lucide icon name, resolved by `dynamic-icon.svelte`. */
	icon: optionalText(60),
	/** One address per line. Empty falls back to the primary contact email. */
	notifyEmails: optionalText(1000),
	defaultAssigneeId: z
		.union([z.string().trim().min(1).max(64), z.literal(''), z.null()])
		.optional()
		.transform((value) => (typeof value === 'string' && value ? value : null)),
	/** Drives the overdue flag on the message list. Blank promises nothing. */
	targetResponseHours: z
		.union([z.coerce.number().int().min(1).max(720), z.literal(''), z.null()])
		.optional()
		.transform((value) => (typeof value === 'number' ? value : null)),
	publicResponseNote: optionalText(300),
	/** Points an enquiry that is really an application at the right form. */
	suggestedPillarId: optionalIdField,
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
