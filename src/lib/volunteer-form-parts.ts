/**
 * What a coordinator may leave out of a volunteer's completion form.
 *
 * The link at `/volunteer/continue/[token]` asks for everything the
 * safeguarding workflow needs. Not every volunteer needs to be asked all of it:
 * somebody who has already described their availability over the phone, or who
 * is plainly not a licensed professional, should not be handed a page of
 * questions they have to scroll past. So the coordinator ticks parts off, and
 * the form is built from what is left.
 *
 * **Three parts are not in this catalogue, deliberately.** The emergency
 * contact, the two references and the declarations are always asked, and there
 * is no key here that could hide them. That is the §0 line: the vocabulary of a
 * form is a coordinator's to edit, but a coordinator switching off the
 * background-check consent would not be shortening a form, they would be
 * disabling a control — the same reason `/volunteer` is not a `form_definitions`
 * row. `LOCKED_SECTIONS` below is shown on the dashboard as a plain statement
 * of that, rather than as toggles that refuse to move.
 *
 * A part maps onto one or more keys of `detailsShape` in
 * `src/routes/volunteer/schema.ts`. Hiding a part removes those keys from the
 * schema entirely, so a hidden question is never a question that failed
 * validation invisibly.
 *
 * This file is imported by both the dashboard and the public route, so it must
 * stay free of server imports.
 */

export type FormPart = {
	/** Stored in `volunteer_invites.hidden_parts`. Never renamed. */
	key: string;
	label: string;
	/** Shown under the toggle, for a coordinator deciding whether to ask. */
	hint?: string;
	/** Keys of `detailsShape` this part governs. */
	fields: string[];
};

export type FormSection = {
	key: string;
	label: string;
	description: string;
	parts: FormPart[];
};

export const VOLUNTEER_FORM_SECTIONS: FormSection[] = [
	{
		key: 'about',
		label: 'About you',
		description: 'Who they are, and where they can travel from.',
		parts: [
			{
				key: 'about.location',
				label: 'Where they live',
				hint: 'Region and town. Worth asking if placement depends on how far they can travel.',
				fields: ['regionId', 'city']
			},
			{
				key: 'about.country',
				label: 'Country',
				hint: 'For volunteers applying from outside Ethiopia.',
				fields: ['country']
			},
			{ key: 'about.dateOfBirth', label: 'Date of birth', fields: ['dateOfBirth'] },
			{ key: 'about.gender', label: 'Gender', fields: ['gender'] },
			{
				key: 'about.occupation',
				label: 'What they do',
				hint: 'Their occupation, and any employer or university volunteering on their behalf.',
				fields: ['occupation', 'organisationName']
			}
		]
	},
	{
		key: 'skills',
		label: 'Skills',
		description: 'What they can be asked to do. Drawn from the skills catalogue.',
		parts: [
			{
				key: 'skills.catalogue',
				label: 'Skills list',
				hint: 'The full catalogue, with a confidence level against each one they tick.',
				fields: ['skills']
			},
			{
				key: 'skills.other',
				label: 'Anything else they can do',
				hint: 'A free-text box for skills the catalogue does not list.',
				fields: ['otherSkills']
			}
		]
	},
	{
		key: 'availability',
		label: 'Availability',
		description: 'When they are free, and how much time they can give.',
		parts: [
			{
				key: 'availability.slots',
				label: 'Times they are usually free',
				hint: 'The grid of time slots. Hide it if you have already agreed a schedule with them.',
				fields: ['timeSlotIds']
			},
			{
				key: 'availability.note',
				label: 'Notes on their availability',
				hint: 'For the caveats a grid cannot hold — "not during exam weeks".',
				fields: ['availabilityNote']
			},
			{
				key: 'availability.commitment',
				label: 'Hours a week, and for how long',
				fields: ['hoursPerWeek', 'commitmentMonths']
			},
			{ key: 'availability.startDate', label: 'When they can start', fields: ['availableFrom'] },
			{
				key: 'availability.heardAbout',
				label: 'How they heard about us',
				fields: ['heardAbout']
			}
		]
	},
	{
		key: 'credentials',
		label: 'Professional credentials',
		description: 'Licences and qualifications, for volunteers offering professional help.',
		parts: [
			{
				key: 'credentials.section',
				label: 'Licences and qualifications',
				hint: 'Hide this for a volunteer who is plainly not applying as a professional. Claiming a credential is what puts them behind licence verification, so asking someone who has none only adds a section for them to skip.',
				fields: ['isProfessional', 'credentials']
			}
		]
	}
];

/**
 * The parts of the form nobody can switch off, and why. Rendered on the
 * dashboard beside the toggles so a coordinator can see the whole form, not
 * only the half they control.
 */
export const LOCKED_SECTIONS = [
	{
		label: 'Emergency contact',
		reason:
			'A volunteer sitting with someone through a hospital night is a person the Foundation is responsible for. "Who do we call" cannot be a question somebody skipped.'
	},
	{
		label: 'Two references',
		reason:
			'The reference checks are a safeguarding control, and `references_checked` is derived from these rows.'
	},
	{
		label: 'Declarations and consent',
		reason:
			'The background-check consent, the code of conduct and the accuracy declaration are the volunteer’s own act. They are recorded as the moment they were given, and nobody can give them on a volunteer’s behalf — not even from this dashboard.'
	}
];

/** Every part key that exists. Anything else in `hidden_parts` is ignored. */
export const ALL_PART_KEYS = VOLUNTEER_FORM_SECTIONS.flatMap((section) =>
	section.parts.map((part) => part.key)
);

/**
 * The schema keys a form should carry, given the parts a coordinator hid.
 *
 * Unknown keys in `hidden` are ignored rather than rejected: a part removed
 * from the catalogue in a later release must not turn every link issued before
 * it into an error, and the failure mode of ignoring it — asking one question
 * more than the coordinator meant to — is the harmless direction.
 */
export function visibleFieldKeys(hidden: Iterable<string>): Set<string> {
	const hiddenSet = new Set(hidden);
	const visible = new Set<string>();

	for (const section of VOLUNTEER_FORM_SECTIONS) {
		for (const part of section.parts) {
			if (hiddenSet.has(part.key)) continue;
			for (const field of part.fields) visible.add(field);
		}
	}

	// The locked parts, which no key can remove.
	for (const field of ALWAYS_ASKED) visible.add(field);

	return visible;
}

/** The fields behind `LOCKED_SECTIONS`. Not toggleable, so not in the catalogue. */
export const ALWAYS_ASKED = [
	'emergencyContactName',
	'emergencyContactPhone',
	'emergencyContactRelationship',
	'references',
	'hasPriorConviction',
	'priorConvictionDetail',
	'consentBackgroundCheck',
	'agreeCodeOfConduct',
	'declareAccurate',
	'acknowledgeNoGuarantee'
] as const;

/** Keeps `hidden_parts` to keys that exist, whatever the browser posted. */
export const sanitiseHiddenParts = (posted: Iterable<string>): string[] => {
	const known = new Set(ALL_PART_KEYS);
	return [...new Set(posted)].filter((key) => known.has(key)).sort();
};
