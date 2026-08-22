import { z } from 'zod/v4';
import { emailField, flagField, optionalEmailField, optionalFlagField } from '$lib/forms/fields';

/**
 * The volunteer application form.
 *
 * Hand-written rather than generated from a `form_definitions` row, unlike the
 * assistance applications. Volunteering is a core workflow with a safeguarding
 * gate on the far end: a coordinator who removed the references section or the
 * background-check consent from the form builder would not be editing copy,
 * they would be disabling a control. What stays editable is the vocabulary the
 * form offers — skills, time slots, professions, programmes — and all four are
 * catalogue rows loaded at request time (§0).
 *
 * Ids are validated for *shape* here and for *existence* in
 * `createVolunteerApplication`, which re-reads every one of them against the
 * live catalogue before writing. Nothing here trusts that a posted id refers to
 * something real.
 */

/**
 * A ceiling on how many catalogue rows one applicant may tick.
 *
 * Every one of these arrays is checked against the live catalogue in
 * `createVolunteerApplication`, so a wrong id is caught there — but only after
 * a round trip per id. The cap is what stops a posted array of fifty thousand
 * entries from becoming fifty thousand queries.
 */
const MAX_CHOICES = 60;

const optional = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

/** An ISO `YYYY-MM-DD` as an `<input type="date">` posts it. */
const isoDate = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker')
	.optional()
	.or(z.literal(''));

export const PROFICIENCY = ['basic', 'intermediate', 'advanced', 'professional'] as const;

export const skillClaimSchema = z.object({
	skillId: z.coerce.number().int().positive(),
	proficiency: z.enum(PROFICIENCY).default('intermediate')
});

export const credentialSchema = z.object({
	professionId: z.coerce.number().int().positive().nullable().default(null),
	/** Only meaningful when the catalogue has no row for what they do. */
	otherProfession: optional(120),
	licenseNumber: optional(60),
	licensingBody: optional(160),
	specialization: optional(160),
	yearsExperience: z.coerce.number().int().min(0).max(70).nullable().default(null),
	issuedOn: isoDate,
	expiresOn: isoDate
});

export const referenceSchema = z.object({
	fullName: z.string().trim().min(2, 'Enter their name').max(150),
	relationship: z.string().trim().min(2, 'How do they know you?').max(120),
	organization: optional(150),
	email: optionalEmailField(),
	phone: optional(32)
});

export const volunteerSchema = z
	.object({
		/* --- About you ---------------------------------------------------- */
		fullName: z.string().trim().min(2, 'Enter your full name').max(150),
		email: emailField(),
		phone: z.string().trim().min(7, 'Enter a phone number we can reach you on').max(32),
		city: optional(120),
		regionId: z.coerce.number().int().positive().nullable().default(null),
		/**
		 * `city` and `regionId` are Ethiopian geography and cannot say "applying
		 * from Toronto", which is the diaspora and every visiting professional.
		 */
		country: optional(100),
		dateOfBirth: isoDate,
		gender: z.enum(['female', 'male', 'other', 'prefer_not_to_say']).nullable().default(null),
		occupation: optional(150),
		/** An employer, university or association volunteering on their behalf. */
		organisationName: optional(200),

		/* --- Emergency contact --------------------------------------------
		   Required, and deliberately so: a volunteer sitting with someone
		   through a hospital night is a person the Foundation is responsible
		   for, and "who do we call" cannot be a field somebody skipped. */
		emergencyContactName: z.string().trim().min(2, 'Enter a name').max(150),
		emergencyContactPhone: z.string().trim().min(7, 'Enter a phone number').max(32),
		emergencyContactRelationship: optional(120),

		/* --- What you would like to do ------------------------------------- */
		pillarIds: z
			.array(z.coerce.number().int().positive())
			.min(1, 'Choose at least one programme')
			.max(MAX_CHOICES, 'That is more programmes than we run'),
		skills: z.array(skillClaimSchema).max(MAX_CHOICES, 'Choose your strongest skills').default([]),
		/** One per line, for anything the catalogue does not list. */
		otherSkills: optional(600),

		/* --- When you are free ---------------------------------------------- */
		timeSlotIds: z
			.array(z.coerce.number().int().positive())
			.min(1, 'Choose at least one time you are usually free')
			.max(MAX_CHOICES, 'That is more slots than the week has'),
		availabilityNote: optional(600),
		hoursPerWeek: z.coerce
			.number()
			.int()
			.min(1, 'At least an hour')
			.max(60, 'That is more than we would ask of anyone')
			.nullable()
			.default(null),
		commitmentMonths: z.coerce.number().int().min(1).max(120).nullable().default(null),
		availableFrom: isoDate,
		motivation: z
			.string()
			.trim()
			.min(20, 'A sentence or two, please')
			.max(2000, 'Keep this under 2000 characters'),
		heardAbout: optional(150),

		/* --- Professional standing ------------------------------------------ */
		isProfessional: flagField(false),
		credentials: z.array(credentialSchema).max(12, 'Twelve qualifications is plenty').default([]),

		/* --- References ------------------------------------------------------ */
		references: z
			.array(referenceSchema)
			.min(2, 'Please give us two references')
			.max(6, 'Six references is more than enough'),

		/* --- Declarations ---------------------------------------------------- */
		hasPriorConviction: optionalFlagField(),
		priorConvictionDetail: optional(1500),
		consentBackgroundCheck: flagField(false).refine(
			(value) => value === true,
			'We cannot proceed without this consent'
		),
		agreeCodeOfConduct: flagField(false).refine(
			(value) => value === true,
			'Please read and accept the code of conduct'
		),
		/**
		 * Required. Everything downstream — references, licence checks,
		 * safeguarding — is an act of trust in what was typed here, so the
		 * declaration that it is true is not an optional extra.
		 */
		declareAccurate: flagField(false).refine(
			(value) => value === true,
			'Please confirm that what you have told us is accurate'
		),
		/**
		 * Required too, and for the applicant's sake rather than ours: approval
		 * depends on safeguarding checks and on there being a placement to offer,
		 * and nobody should learn that only after waiting.
		 */
		acknowledgeNoGuarantee: flagField(false).refine(
			(value) => value === true,
			'Please confirm you understand this'
		),

		/**
		 * Honeypot — see the note in `$lib/server/forms`.
		 *
		 * Deliberately permissive: a `max(0)` here would fail validation and hand
		 * the bot back "please check the highlighted fields", which tells it
		 * exactly which field to leave alone next time. Any value at all is
		 * allowed through the schema so the action can accept it and store
		 * nothing.
		 */
		website: z.string().max(200).optional().or(z.literal(''))
	})
	/**
	 * A volunteer who says they are a professional has to say *what* they are.
	 * The check lives here rather than on the field so the message lands on the
	 * credentials section, which is where the missing answer is.
	 */
	.refine(
		(data) =>
			!data.isProfessional ||
			data.credentials.some(
				(credential) => credential.professionId || credential.otherProfession?.trim()
			),
		{
			path: ['credentials'],
			message: 'Tell us which profession you are licensed in'
		}
	)
	/** Disclosing a conviction and then not describing it is not a disclosure. */
	.refine(
		(data) => data.hasPriorConviction !== true || Boolean(data.priorConvictionDetail?.trim()),
		{
			path: ['priorConvictionDetail'],
			message: 'Please tell us briefly what happened'
		}
	);

export type VolunteerSchema = typeof volunteerSchema;
