import { z } from 'zod/v4';
import { flagField, optionalEmailField } from '$lib/forms/fields';
import { toMinor } from '$lib/money';

/**
 * The public donation form.
 *
 * Amounts are entered in birr and stored in santim — the transform happens
 * here so nothing downstream has to remember. Nothing about currency,
 * designation or account is trusted from the client beyond an id: the server
 * re-reads the chosen pillar and account and takes their currency, so a posted
 * `currency: 'USD'` on an ETB account cannot mislabel a gift.
 */
export const donateSchema = z.object({
	/** Birr, converted to santim. 10 million birr is the "please call us" ceiling. */
	amount: z.coerce
		.number({ message: 'Enter an amount' })
		.min(1, 'Enter an amount')
		.max(10_000_000, 'For a gift this size, please contact us directly')
		.transform((birr) => toMinor(birr)),

	frequency: z.enum(['one_time', 'monthly']).default('one_time'),

	designationType: z.enum(['general_fund', 'pillar', 'future_initiative']).default('general_fund'),
	designationPillarId: z.coerce.number().int().positive().nullable().optional(),
	designationInitiativeId: z.coerce.number().int().positive().nullable().optional(),

	paymentAccountId: z.coerce.number().int().positive().nullable().optional(),

	donorName: z.string().trim().min(2, 'Enter your name').max(150),
	donorEmail: optionalEmailField(),
	donorPhone: z.string().trim().max(32).optional().or(z.literal('')),
	/**
	 * Optional throughout: most gifts are from a person. A company, school or
	 * association giving in its own name still needs a human being on the
	 * record, so `donorName` stays required and this sits beside it.
	 */
	donorOrganisation: z.string().trim().max(200).optional().or(z.literal('')),
	isDiaspora: flagField(false),
	/** Where the gift is coming from. Asked of diaspora donors, kept for all. */
	donorCountry: z.string().trim().max(100).optional().or(z.literal('')),

	isAnonymous: flagField(false),
	donorMessage: z
		.string()
		.trim()
		.max(500, 'Keep this under 500 characters')
		.optional()
		.or(z.literal('')),

	/** Opt-in, checked before the donor is ever added to the newsletter. */
	joinNewsletter: flagField(false),

	/** Honeypot — see the note in `$lib/server/forms`. */
	website: z.string().max(200).optional().or(z.literal(''))
});

export type DonateSchema = typeof donateSchema;
