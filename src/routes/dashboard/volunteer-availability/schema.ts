import { z } from 'zod/v4';
import {
	flagField,
	optionalNumberField,
	optionalText,
	slugField,
	sortOrderField
} from '$lib/server/crud';

/** A 24-hour `HH:MM`, or blank for a slot with no fixed hours. */
const timeField = z
	.string()
	.trim()
	.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM')
	.optional()
	.or(z.literal(''))
	.transform((value) => (value ? value : null));

/**
 * One window a volunteer can say they are free in.
 *
 * The Foundation running a Wednesday evening clinic next year is a row here,
 * not a migration — and because a volunteer's availability is a join against
 * these rows, "who is free on Saturday morning?" stays a query.
 */
export const addSchema = z.object({
	slug: slugField,
	label: z.string().trim().min(1, 'Required').max(120),
	/**
	 * 0 = Sunday … 6 = Saturday. Blank for a slot with no fixed day — and it has
	 * to stay blank, which is why this is `optionalNumberField` rather than a
	 * hand-rolled union: `z.coerce.number()` turns a blank into 0, and 0 is a
	 * real weekday here, so "any day" would silently become "Sunday".
	 */
	dayOfWeek: optionalNumberField({ min: 0, max: 6, int: true }),
	startTime: timeField,
	endTime: timeField,
	description: optionalText(300),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
