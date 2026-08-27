import { z } from 'zod/v4';
import { emailField, flagField, optionalEmailField, optionalFlagField } from '$lib/forms/fields';
import { PERSON_GENDERS } from '$lib/gender';
import { visibleFieldKeys } from '$lib/volunteer-form-parts';

/**
 * The volunteer application form, in two halves.
 *
 * `intakeSchema` is what the public page at `/volunteer` asks: a name, two ways
 * to reach the person, why they want to help, and which programmes they are
 * drawn to. Five questions, because the person filling it in is saying "I would
 * like to help" and nothing more should stand between them and saying it.
 *
 * `detailsSchema` is everything the safeguarding workflow eventually needs —
 * emergency contact, skills, availability, credentials, references, the
 * declarations. None of it is gone; it has moved to *after* someone at the
 * Foundation has spoken to the volunteer, and it is filled in either by staff
 * on the volunteer's file or by the volunteer through a link staff send them.
 * The columns and catalogue joins behind these fields are unchanged.
 *
 * `volunteerSchema` is the two together, which is the shape of that later form.
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

/* ==========================================================================
   The intake — what /volunteer asks
   ========================================================================== */

/**
 * Held as a plain shape rather than a schema so the full form below can be
 * composed from the same field definitions. A `.refine()` turns a ZodObject
 * into a ZodEffects, which cannot be extended, so composition has to happen
 * before the rules are attached.
 */
const intakeShape = {
	fullName: z.string().trim().min(2, 'Enter your full name').max(150),
	email: emailField(),
	phone: z.string().trim().min(7, 'Enter a phone number we can reach you on').max(32),
	/**
	 * Stored in `motivation`, which is the column a coordinator already reads.
	 * Asked for on the page as "tell us a little about yourself" rather than as
	 * a formal statement — this is a first hello, not a personal statement.
	 */
	motivation: z
		.string()
		.trim()
		.min(20, 'A sentence or two, please')
		.max(2000, 'Keep this under 2000 characters'),
	pillarIds: z
		.array(z.coerce.number().int().positive())
		.min(1, 'Choose at least one programme')
		.max(MAX_CHOICES, 'That is more programmes than we run'),

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
};

export const intakeSchema = z.object(intakeShape);

export type IntakeSchema = typeof intakeSchema;

/* ==========================================================================
   The rest — asked once someone has spoken to the volunteer
   ========================================================================== */

export const detailsShape = {
	/* --- About you ---------------------------------------------------- */
	city: optional(120),
	regionId: z.coerce.number().int().positive().nullable().default(null),
	/**
	 * `city` and `regionId` are Ethiopian geography and cannot say "applying
	 * from Toronto", which is the diaspora and every visiting professional.
	 */
	country: optional(100),
	dateOfBirth: isoDate,
	gender: z.enum(PERSON_GENDERS).nullable().default(null),
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
	)
};

/**
 * The two cross-field rules. Attached by a helper because they apply to the
 * details on their own and to the details as part of the full form, and a
 * refinement copied into two places is a refinement that will be fixed in one.
 */
/**
 * Partial, because a form built from an invite may not carry every one of
 * these: a coordinator who hid the credentials section leaves a schema with no
 * `credentials` key at all, and a rule that assumed one would throw on the
 * first submission rather than fail validation. Both rules below therefore
 * check what is in front of them and pass when the question was never asked —
 * which is right, since a question nobody was asked cannot be answered
 * inconsistently.
 */
type VolunteerRuleFields = Partial<{
	isProfessional: boolean;
	credentials: { professionId: number | null; otherProfession?: string }[];
	hasPriorConviction: boolean | null;
	priorConvictionDetail: string;
}>;

const withVolunteerRules = <T extends z.ZodType<VolunteerRuleFields>>(schema: T): T =>
	schema
		/**
		 * A volunteer who says they are a professional has to say *what* they
		 * are. The check lives here rather than on the field so the message
		 * lands on the credentials section, which is where the missing answer
		 * is.
		 */
		.refine(
			(data) =>
				!data.isProfessional ||
				!data.credentials ||
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

export const detailsSchema = withVolunteerRules(z.object(detailsShape));

export type DetailsSchema = typeof detailsSchema;

/** Everything the details half collects, once validated. */
export type DetailsValues = z.infer<typeof detailsSchema>;

/**
 * The details form as one particular volunteer will see it.
 *
 * A coordinator hides parts of the form on the invite (see
 * `$lib/volunteer-form-parts`), and a hidden part's fields are dropped from the
 * schema rather than made optional. That distinction is the point: an omitted
 * key is a question that was never asked, so it never reaches
 * `updateVolunteerDetails` and cannot overwrite an answer staff already typed
 * into the file. A field left merely optional would post an empty string and
 * blank the column.
 *
 * The requirements that survive are the ones on the fields that are still
 * there: two references, an emergency contact, the declarations. Those parts
 * cannot be hidden, so those rules cannot be dropped.
 *
 * The shape is assembled at request time, so its type is stated rather than
 * inferred — every field is optional to the type system because which ones
 * exist is a runtime decision.
 */
export function detailsSchemaFor(hidden: Iterable<string> = []): z.ZodType<Partial<DetailsValues>> {
	const visible = visibleFieldKeys(hidden);
	const shape = Object.fromEntries(
		Object.entries(detailsShape).filter(([key]) => visible.has(key))
	);

	return withVolunteerRules(z.object(shape) as unknown as z.ZodType<Partial<DetailsValues>>);
}

/**
 * The same fields for a staff member filling the file in on someone's behalf.
 *
 * Two deliberate differences from what the volunteer is asked.
 *
 * **Nothing is required.** A coordinator typing up a phone call has whatever
 * the phone call produced, and being refused for want of a second reference
 * would mean losing the first one too. The control that matters is elsewhere
 * and unchanged: `safeguarding_checklist_complete` and `credentials_verified`
 * still gate approval, so an incomplete file cannot be approved however it was
 * filled in.
 *
 * **The declarations are not here at all.** `background_check_consent_at` and
 * the three beside it record the moment a volunteer agreed to something. A
 * staff member cannot agree on their behalf, so this form does not offer the
 * option — those four are asked only through the volunteer's own link.
 */
export const adminDetailsSchema = withVolunteerRules(
	z
		.object(detailsShape)
		.omit({
			consentBackgroundCheck: true,
			agreeCodeOfConduct: true,
			declareAccurate: true,
			acknowledgeNoGuarantee: true
		})
		.extend({
			emergencyContactName: optional(150),
			emergencyContactPhone: optional(32),
			timeSlotIds: z.array(z.coerce.number().int().positive()).max(MAX_CHOICES).default([]),
			references: z.array(referenceSchema).max(6, 'Six references is more than enough').default([])
		})
);

export type AdminDetailsSchema = typeof adminDetailsSchema;

/** Intake and details together — the full application, filled in once. */
export const volunteerSchema = withVolunteerRules(z.object({ ...intakeShape, ...detailsShape }));

export type VolunteerSchema = typeof volunteerSchema;
