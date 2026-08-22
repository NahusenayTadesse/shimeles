import { z } from 'zod/v4';
import { flagField, optionalEmailField, optionalNumberField } from '$lib/forms/fields';

/**
 * The assistance application.
 *
 * The governing constraint here is the opposite of the volunteer form's. That
 * one is a gate and validates hard, because a volunteer who skips the
 * safeguarding questions must not get through. This one is a front door for
 * people asking for help, and §3.3 makes it low-barrier on purpose: almost
 * everything is optional, because the alternative to an incomplete application
 * is not a complete one, it is no application.
 *
 * Four things are required, and only four: who is asking, one way to reach
 * somebody, some description of what is needed, and consent to store it.
 */

const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

const isoDate = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker')
	.optional()
	.or(z.literal(''));

/**
 * A number that may simply be left blank, which most of these will be.
 * Blank stays blank — see `optionalNumberField` for why the ordering inside it
 * matters, and what goes wrong when a cost nobody knows becomes zero.
 */
const optionalNumber = (min: number, max: number) => optionalNumberField({ min, max });

/** A yes/no that may also be "did not say". */
const optionalFlag = z
	.union([z.boolean(), z.literal('true'), z.literal('false'), z.literal(''), z.null()])
	.optional()
	.transform((value) => {
		if (typeof value === 'boolean') return value;
		if (value === 'true') return true;
		if (value === 'false') return false;
		return null;
	});

export const URGENCY = ['whenever', 'weeks', 'days', 'immediate'] as const;

export const needClaimSchema = z.object({
	needId: z.coerce.number().int().positive(),
	detail: optional(600),
	/** Birr as typed; the server converts to santim. */
	estimatedAmount: optionalNumber(0, 10_000_000),
	urgency: z.enum(URGENCY).default('weeks')
});

export const applySchema = z
	.object({
		/* --- What this is about --------------------------------------------- */
		pillarId: z.coerce.number().int().positive().nullable().default(null),
		/** Capped: the catalogue is a few dozen rows, so a longer list is a bot. */
		needs: z
			.array(needClaimSchema)
			.max(30, 'That is more needs than we can take at once')
			.default([]),
		/**
		 * The heart of the form. Required, but only 10 characters — enough to
		 * refuse an empty box, not enough to demand an essay from someone who
		 * finds writing hard.
		 */
		story: z
			.string()
			.trim()
			.min(10, 'Please tell us what is happening, even briefly')
			.max(5000, 'Keep this under 5000 characters'),
		/** Which language the story above is written in. */
		writtenLanguageId: z.coerce.number().int().positive().nullable().default(null),

		/* --- Who is asking --------------------------------------------------- */
		applyingFor: z.enum(['self', 'other']).default('self'),
		relationship: optional(120),

		applicantName: z.string().trim().min(2, 'Please tell us your name').max(150),
		applicantPhone: optional(32),
		applicantEmail: optionalEmailField(),

		/* --- Who needs help --------------------------------------------------- */
		subjectName: optional(150),
		subjectDateOfBirth: isoDate,
		subjectApproximateAge: optionalNumber(0, 120),
		subjectGender: z.enum(['female', 'male', 'other', 'undisclosed']).default('undisclosed'),
		subjectPhone: optional(32),
		city: optional(120),
		addressLine: optional(240),
		regionId: z.coerce.number().int().positive().nullable().default(null),

		/* --- Circumstances ---------------------------------------------------- */
		householdSize: optionalNumber(1, 40),
		dependantsCount: optionalNumber(0, 40),
		monthlyIncome: optionalNumber(0, 10_000_000),
		incomeSource: optional(200),
		isEmployed: optionalFlag,
		hasDisability: optionalFlag,
		healthDetail: optional(1500),
		otherSupport: optional(1000),

		/* --- Reaching them ----------------------------------------------------- */
		safeToContact: flagField(true),
		contactNotes: optional(500),
		bestTimeToContact: optional(120),
		alternateContactName: optional(150),
		alternateContactPhone: optional(32),

		/* --- Consent ------------------------------------------------------------ */
		/**
		 * Storing the application is the only genuinely required consent —
		 * without it there is nothing we may keep. Verification consent is asked
		 * for separately and an application without it is still accepted, just
		 * slower to assess.
		 */
		consentToStore: flagField(false).refine(
			(value) => value === true,
			'We need your permission to keep this application'
		),
		consentToVerify: flagField(false),
		/**
		 * Required, unlike verification consent. An assessment rests entirely on
		 * what is written here, and the declaration that it is true is the only
		 * thing a caseworker has to start from.
		 */
		declareAccurate: flagField(false).refine(
			(value) => value === true,
			'Please confirm that what you have told us is accurate'
		),
		/**
		 * Required too, and for the applicant's sake: the waiting list is the
		 * usual outcome, assessed each intake round, and nobody should discover
		 * that only after months of waiting for a call.
		 */
		acknowledgeNoGuarantee: flagField(false).refine(
			(value) => value === true,
			'Please confirm you understand this'
		),

		/** Honeypot — permissive on purpose; see the note in the contact schema. */
		website: z.string().max(200).optional().or(z.literal(''))
	})
	/** Somewhere to send an answer. Either channel will do; neither will not. */
	.refine((data) => Boolean(data.applicantPhone?.trim()) || Boolean(data.applicantEmail?.trim()), {
		path: ['applicantPhone'],
		message: 'Please leave a phone number or an email address so we can reach you'
	})
	/** Applying for someone else means telling us who they are. */
	.refine((data) => data.applyingFor !== 'other' || Boolean(data.subjectName?.trim()), {
		path: ['subjectName'],
		message: 'Please tell us the name of the person you are applying for'
	})
	.refine((data) => data.applyingFor !== 'other' || Boolean(data.relationship?.trim()), {
		path: ['relationship'],
		message: 'Please tell us how you know them'
	});

export type ApplySchema = typeof applySchema;
