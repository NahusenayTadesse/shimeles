/**
 * The one gender vocabulary the Foundation records for a person.
 *
 * Three values, and deliberately no fourth. It used to differ in every place
 * it appeared: `/apply` and the beneficiary screen offered
 * `female | male | other | undisclosed`, the volunteer form offered
 * `female | male | other | prefer_not_to_say`, and the apply form rendered the
 * value `undisclosed` under the label "Prefer not to say" — so the same answer
 * was stored under two different names depending on which form somebody filled
 * in, and "how many women did this programme reach" was a question split
 * across four buckets.
 *
 * `other` is gone, and `undisclosed` is folded into `prefer_not_to_say`
 * because they were always the same answer: the person did not tell us.
 * `prefer_not_to_say` is also the default everywhere, since an application is
 * never refused for a blank and a missing answer has to land on the value that
 * says nothing about the person.
 *
 * This is *not* the `unisex | female | male` field on an in-kind clothing item.
 * That one describes who a garment was cut for, not who anybody is, and it
 * stays where it is.
 */
export const PERSON_GENDERS = ['female', 'male', 'prefer_not_to_say'] as const;

export type PersonGender = (typeof PERSON_GENDERS)[number];

export const PERSON_GENDER_LABELS: Record<PersonGender, string> = {
	female: 'Female',
	male: 'Male',
	prefer_not_to_say: 'Prefer not to say'
};

/**
 * Ready for `SelectComp` and the dashboard's generated screens, both of which
 * want `{ value, name }`. "Prefer not to say" leads because it is the default.
 */
export const PERSON_GENDER_OPTIONS = [
	{ value: 'prefer_not_to_say', name: PERSON_GENDER_LABELS.prefer_not_to_say },
	{ value: 'female', name: PERSON_GENDER_LABELS.female },
	{ value: 'male', name: PERSON_GENDER_LABELS.male }
];

/**
 * Reads a stored value back as one of the three.
 *
 * Rows written before this vocabulary existed hold `other` or `undisclosed`.
 * Migration `0017` rewrites them, but a value arriving from an older export,
 * a stale tab or a hand-made POST must still render as something a person can
 * read rather than as a raw column value.
 */
export function personGender(value: string | null | undefined): PersonGender {
	return (PERSON_GENDERS as readonly string[]).includes(value ?? '')
		? (value as PersonGender)
		: 'prefer_not_to_say';
}

/** The label for a stored value, safe against anything older. */
export const genderLabel = (value: string | null | undefined) =>
	PERSON_GENDER_LABELS[personGender(value)];
