import { z } from 'zod/v4';
import { flagField, moneyField, optionalIdField, optionalText } from '$lib/server/crud';

/**
 * A disbursement — the record that proves where a donation actually went.
 *
 * `paidTo` is required and is deliberately the hospital, school or supplier
 * rather than the beneficiary: "we gave a family 12,000 birr" is a claim,
 * "we paid Tikur Anbessa 12,000 birr on 14 August for this case" is evidence.
 */
export const addSchema = z.object({
	formSubmissionId: optionalIdField,
	beneficiaryId: optionalIdField,
	pillarId: optionalIdField,
	amount: moneyField,
	currency: z.string().trim().length(3).default('ETB'),
	paidTo: z.string().trim().min(1, 'Required').max(200),
	disbursementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
	fundSource: z.enum(['general_fund', 'designated']).default('general_fund'),
	designationPillarId: optionalIdField,
	narrative: optionalText(2000),
	isActive: flagField(true)
});

export const editSchema = addSchema.extend({ id: z.coerce.number() });
