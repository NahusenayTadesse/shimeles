/**
 * What a validation failure says to the person who hit it.
 *
 * Two rules, both learned from watching the generated messages next to a real
 * form:
 *
 * 1. **Never repeat the label.** The old generator built every message as
 *    `${label} must be a valid ${thing}`, which on a field labelled "Phone
 *    number" read "Phone number must be a valid phone number" and on "Email
 *    address" read "Email address must be a valid email address". The label is
 *    written by staff and frequently already names the thing, so the message
 *    must not name it again.
 * 2. **Say what to do, not what is wrong.** "Invalid format" tells someone
 *    their answer is unacceptable and leaves them to guess; "use a number like
 *    0911 234 567" tells them what to type. Every message below is an
 *    instruction, and the ones with a shape to them carry an example.
 *
 * The house style is `Label: instruction.` The label leads because these
 * messages also appear in the error summary at the top of the form, where the
 * field is not visible and the label is the only thing identifying it. The
 * labels themselves are staff-written and may be a noun ("Your full name") or
 * a question ("What kind of help do you need?"), so nothing here may assume
 * grammar it can bend, which is why it is a colon rather than a sentence that
 * tries to absorb the label.
 */

const clean = (label: string) => label.trim().replace(/[:*]\s*$/, '');

/** `Label: instruction.` */
const say = (label: string, instruction: string) => `${clean(label)}: ${instruction}`;

export const messages = {
	/* --- Nothing was entered ------------------------------------------------ */

	/**
	 * `Please answer:` leads here rather than trailing, because it is the one
	 * case where the label may be a whole question and reads best last.
	 */
	required: (label: string) => `Please answer: ${clean(label)}`,
	chooseOne: (label: string) => `Please choose an option: ${clean(label)}`,
	tickAtLeastOne: (label: string) => `Please tick at least one: ${clean(label)}`,
	tickBox: (label: string) => `Please tick this box: ${clean(label)}`,
	attachFile: (label: string) => `Please attach a file: ${clean(label)}`,

	/* --- Something was entered, but not in a usable shape -------------------- */

	phone: (label: string) => say(label, 'try 0911 234 567, or +251911234567 from abroad'),
	email: (label: string) => say(label, 'this should look like name@example.com'),
	date: (label: string) => say(label, 'please pick the date from the calendar'),
	number: (label: string) => say(label, 'please enter digits only, like 12'),
	notAnOption: (label: string) => say(label, 'please choose one of the options offered'),
	pattern: (label: string) => say(label, 'that is not in the format we expect'),

	/* --- Entered, but out of range ------------------------------------------- */

	min: (label: string, min: number) => say(label, `please enter ${min} or more`),
	max: (label: string, max: number) => say(label, `please enter ${max} or less`),
	tooShort: (label: string, minLength: number) =>
		say(label, `please write a little more (at least ${minLength} characters)`),
	tooLong: (label: string, maxLength: number) =>
		say(label, `please keep this under ${maxLength} characters`),

	/* --- Attachments ---------------------------------------------------------- */

	fileTooBig: (label: string, mb: number) =>
		say(label, `that file is over ${mb} MB, please choose a smaller one`),
	fileWrongType: (label: string) => say(label, 'please attach a PDF or a photo')
};
