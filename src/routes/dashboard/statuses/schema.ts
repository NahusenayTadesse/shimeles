import { z } from 'zod/v4';
import { flagField, optionalText, sortOrderField } from '$lib/server/crud';

/**
 * A workflow status.
 *
 * `stage` is the one field on this screen that is *not* a free choice: it is
 * the code-level category that gates logic such as the volunteer safeguarding
 * rule and the impact metrics' definition of "supported". §7 puts it firmly on
 * the developer side of the line — the dropdown offers only the stages the code
 * knows, and relabelling is what staff are meant to do here instead.
 */
const applicationStages = [
	'submitted',
	'under_review',
	'verified',
	'approved',
	'declined',
	'active',
	'closed'
] as const;
const volunteerStages = [
	'submitted',
	'under_review',
	'references_checked',
	'credentials_verified',
	'approved',
	'declined'
] as const;

export const addSchema = z.object({
	context: z.enum(['application', 'volunteer', 'donation']).default('application'),
	stage: z.enum([...applicationStages, ...volunteerStages]),
	label: z.string().trim().min(1, 'Required').max(80),
	color: z.string().trim().min(1).max(30).default('slate'),
	publicDescription: optionalText(300),
	notifyApplicant: flagField(false),
	isDefault: flagField(false),
	isActive: flagField(true),
	sortOrder: sortOrderField
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
