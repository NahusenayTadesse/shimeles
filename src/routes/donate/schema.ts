import { z } from 'zod/v4';

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
		.transform((birr) => Math.round(birr * 100)),

	frequency: z.enum(['one_time', 'monthly']).default('one_time'),

	designationType: z.enum(['general_fund', 'pillar', 'future_initiative']).default('general_fund'),
	designationPillarId: z.coerce.number().int().positive().nullable().optional(),
	designationInitiativeId: z.coerce.number().int().positive().nullable().optional(),

	paymentAccountId: z.coerce.number().int().positive().nullable().optional(),

	donorName: z.string().trim().min(2, 'Enter your name').max(150),
	donorEmail: z.union([z.email('Enter a valid email address'), z.literal('')]).optional(),
	donorPhone: z.string().trim().max(32).optional().or(z.literal('')),
	isDiaspora: z.coerce.boolean().default(false),

	isAnonymous: z.coerce.boolean().default(false),
	donorMessage: z
		.string()
		.trim()
		.max(500, 'Keep this under 500 characters')
		.optional()
		.or(z.literal('')),

	/** Opt-in, checked before the donor is ever added to the newsletter. */
	joinNewsletter: z.coerce.boolean().default(false),

	/** Honeypot — see the note in `$lib/server/forms`. */
	website: z.string().max(0).optional().or(z.literal(''))
});

export type DonateSchema = typeof donateSchema;
