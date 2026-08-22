import { describe, expect, it } from 'vitest';
import { defaults, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { buildSchema, normaliseFormData } from '$lib/server/forms';
import type { RenderField, RenderForm } from '$lib/forms/types';

/**
 * What the form builder actually produces, posted the way a browser posts it.
 *
 * These go through `superValidate` with a real `FormData` rather than calling
 * the Zod schema directly, because that is where the interesting failures live:
 * how Superforms decides to read a key out of `FormData` depends on the
 * schema's *input* type, and a schema that parses a clean object perfectly can
 * still mangle what an actual `<form>` sends.
 *
 * The scenarios are written as a person filling the form in, not as a
 * developer exercising branches — someone who ticks one box rather than three,
 * types "0911 234 567" with the spaces in, and leaves everything optional
 * blank.
 */

const field = (over: Partial<RenderField> & Pick<RenderField, 'key' | 'label' | 'type'>) =>
	({
		hint: null,
		placeholder: null,
		options: [],
		required: false,
		validation: {},
		showWhen: null,
		...over
	}) as RenderField;

/** A form with one of everything, close to the seeded Medical Hardship one. */
const testForm = (over: Partial<RenderForm> = {}): RenderForm => ({
	id: 1,
	slug: 'test-form',
	title: 'Test form',
	introText: null,
	successMessage: null,
	requiresDocuments: false,
	isLowBarrier: false,
	pillar: null,
	fields: [
		field({ key: 'section', label: 'About you', type: 'heading' }),
		field({ key: 'full_name', label: 'Your full name', type: 'text', required: true }),
		field({ key: 'phone', label: 'Phone number', type: 'phone', required: true }),
		field({ key: 'email', label: 'Email address', type: 'email' }),
		field({ key: 'age', label: 'Your age', type: 'number', validation: { min: 0, max: 120 } }),
		field({ key: 'start_date', label: 'When did it start?', type: 'date' }),
		field({
			key: 'grade',
			label: 'Grade or year',
			type: 'select',
			options: [
				{ value: 'primary', label: 'Primary' },
				{ value: 'secondary', label: 'Secondary' }
			]
		}),
		field({
			key: 'support_needed',
			label: 'What kind of help do you need?',
			type: 'multiselect',
			required: true,
			options: [
				{ value: 'treatment_cost', label: 'Help with treatment costs' },
				{ value: 'medication', label: 'Medication' },
				{ value: 'transport', label: 'Transport to appointments' }
			]
		}),
		field({
			key: 'story',
			label: 'Tell us what is happening',
			type: 'textarea',
			required: true,
			validation: { minLength: 20, maxLength: 3000 }
		}),
		field({
			key: 'consent',
			label: 'I agree to you keeping this',
			type: 'checkbox',
			required: true
		})
	],
	...over
});

/** Exactly what a browser sends: every control, as a string. */
function browserPost(values: Record<string, string | string[]>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(values)) {
		if (Array.isArray(value)) {
			// A `<select multiple>` and a group of same-named checkboxes both post
			// one entry per choice. This is the shape the builder's renderer has to
			// survive.
			for (const entry of value) body.append(key, entry);
		} else {
			body.append(key, value);
		}
	}
	return body;
}

/** A sensible, complete answer — the happy path a real applicant leaves. */
const completeAnswers = {
	full_name: 'Almaz Bekele',
	phone: '0911 234 567',
	email: '',
	age: '',
	start_date: '',
	grade: '',
	support_needed: ['treatment_cost', 'medication'],
	story: 'My mother needs an operation and we cannot cover the hospital fees.',
	consent: 'true',
	submittedByName: '',
	submittedByPhone: '',
	submittedByEmail: '',
	website: ''
};

/**
 * The whole server-side path a submission takes: normalise the wire format,
 * then validate. Deliberately not just `buildSchema` — the two halves are only
 * correct together, and testing the schema alone is what let the multiselect
 * bug live as long as it did.
 */
const validate = (values: Record<string, string | string[]>, form = testForm()) =>
	superValidate(normaliseFormData(form, browserPost(values)), zod4(buildSchema(form)));

/**
 * Superforms files an error against the field itself for a scalar and under
 * `_errors` for a whole-array complaint ("tick at least one"). A person reads
 * both the same way, so the tests do too.
 */
/**
 * One answer out of a validated payload.
 *
 * The schema's *keys* come from the form definition at runtime, so TypeScript
 * only knows about the four fixed columns every submission carries. Reading a
 * dynamic answer therefore needs a cast, and it is worth one helper rather
 * than one per assertion.
 */
const answer = (result: { data: unknown }, key: string): unknown =>
	(result.data as Record<string, unknown>)[key];

const messagesFor = (errors: Record<string, unknown>, key: string): string => {
	const entry = (errors as Record<string, unknown>)[key];
	if (!entry) return '';
	if (Array.isArray(entry)) return entry.join(' ');
	if (typeof entry === 'object') {
		return Object.values(entry as Record<string, unknown>)
			.flatMap((value) => (Array.isArray(value) ? value : [String(value)]))
			.join(' ');
	}
	return String(entry);
};

describe('a complete application', () => {
	it('is accepted', async () => {
		const result = await validate(completeAnswers);
		expect(result.errors).toEqual({});
		expect(result.valid).toBe(true);
	});

	it('keeps every ticked box', async () => {
		const result = await validate(completeAnswers);
		expect(answer(result, 'support_needed')).toEqual(['treatment_cost', 'medication']);
	});

	it('keeps a phone number written with spaces in it', async () => {
		const result = await validate(completeAnswers);
		expect(answer(result, 'phone')).toBe('0911 234 567');
	});
});

describe('tick-all-that-apply', () => {
	it('survives exactly one box being ticked', async () => {
		const result = await validate({ ...completeAnswers, support_needed: ['medication'] });
		expect(answer(result, 'support_needed')).toEqual(['medication']);
	});

	it('survives every box being ticked', async () => {
		const all = ['treatment_cost', 'medication', 'transport'];
		const result = await validate({ ...completeAnswers, support_needed: all });
		expect(answer(result, 'support_needed')).toEqual(all);
	});

	it('refuses a submission with nothing ticked, and says so in words', async () => {
		const result = await validate({ ...completeAnswers, support_needed: [] });
		expect(result.valid).toBe(false);
		expect(messagesFor(result.errors, 'support_needed')).toMatch(/tick|choose|select/i);
	});
});

describe('a required consent box', () => {
	it('is satisfied when it is ticked', async () => {
		const result = await validate({ ...completeAnswers, consent: 'true' });
		expect(answer(result, 'consent')).toBe(true);
	});

	it('is NOT satisfied by an unticked box posting the string "false"', async () => {
		// The trap this guards: `z.coerce.boolean()` turns the string "false" into
		// `true`, so a consent box nobody ticked would satisfy its own refinement.
		const result = await validate({ ...completeAnswers, consent: 'false' });
		expect(result.valid).toBe(false);
		expect(messagesFor(result.errors, 'consent')).toMatch(/tick/i);
	});

	it('parses an unticked *optional* box to boolean false, not the string', async () => {
		const form = testForm({
			fields: [
				...testForm().fields.filter((f) => f.key !== 'consent'),
				field({ key: 'newsletter', label: 'Send me updates', type: 'checkbox' })
			]
		});
		const rest = { ...completeAnswers };
		delete (rest as Partial<typeof completeAnswers>).consent;
		const result = await validate({ ...rest, newsletter: 'false' }, form);
		expect(answer(result, 'newsletter')).toBe(false);
	});

	it('is NOT satisfied by the box being absent altogether', async () => {
		const withoutConsent = { ...completeAnswers };
		delete (withoutConsent as Partial<typeof completeAnswers>).consent;
		const result = await validate(withoutConsent);
		expect(result.valid).toBe(false);
	});
});

describe('optional questions left blank', () => {
	it('does not complain about any of them', async () => {
		const result = await validate(completeAnswers);
		expect(result.errors).toEqual({});
	});

	it('leaves a blank number blank rather than calling it zero', async () => {
		const result = await validate({ ...completeAnswers, age: '' });
		expect(answer(result, 'age')).not.toBe(0);
	});

	it('accepts an untouched select', async () => {
		const result = await validate({ ...completeAnswers, grade: '' });
		expect(result.valid).toBe(true);
	});

	it('accepts an untouched date', async () => {
		const result = await validate({ ...completeAnswers, start_date: '' });
		expect(result.valid).toBe(true);
	});
});

describe('the messages a person actually reads', () => {
	it('does not say the label twice when a phone number is wrong', async () => {
		const result = await validate({ ...completeAnswers, phone: 'call me' });
		const message = messagesFor(result.errors, 'phone');
		expect(message).not.toMatch(/Phone number must be a valid phone number/i);
	});

	it('says how long the answer needs to be, not just that it is wrong', async () => {
		const result = await validate({ ...completeAnswers, story: 'help' });
		expect(messagesFor(result.errors, 'story')).toMatch(/20/);
	});

	it('names the question when a required text field is empty', async () => {
		const result = await validate({ ...completeAnswers, full_name: '' });
		expect(messagesFor(result.errors, 'full_name')).toMatch(/full name/i);
	});
});

describe('the traps a builder-generated schema can fall into', () => {
	it('does not turn a blank optional number into zero', async () => {
		// The classic `z.coerce.number()` trap: it accepts `''` and returns 0, so
		// "I do not know how old they are" becomes "they are 0".
		const result = await validate({ ...completeAnswers, age: '' });
		expect(answer(result, 'age') ?? null).toBeNull();
	});

	it('does not demand a file on an optional upload nobody touched', async () => {
		// An untouched `<input type="file">` posts a zero-byte File, not nothing.
		// A `.refine(size > 0)` behind `.optional()` therefore still fires.
		const form = testForm({
			fields: [
				...testForm().fields,
				field({ key: 'letter', label: 'Medical letter', type: 'file_upload' })
			]
		});
		const body = browserPost(completeAnswers);
		body.append('letter', new File([], '', { type: 'application/octet-stream' }));

		const result = await superValidate(body, zod4(buildSchema(form)));
		expect(messagesFor(result.errors, 'letter')).toBe('');
	});

	it('keeps a required upload required', async () => {
		const form = testForm({
			fields: [
				...testForm().fields,
				field({ key: 'letter', label: 'Medical letter', type: 'file_upload', required: true })
			]
		});
		const body = browserPost(completeAnswers);
		body.append('letter', new File([], '', { type: 'application/octet-stream' }));

		const result = await superValidate(body, zod4(buildSchema(form)));
		expect(result.valid).toBe(false);
	});
});

describe('answers that arrive in an older or staler shape', () => {
	it('still understands a selection posted as one comma-joined value', async () => {
		// What a page cached in someone's browser before the renderer changed
		// still posts. It must keep working rather than fail as "not an option".
		const result = await validate({
			...completeAnswers,
			support_needed: 'treatment_cost,medication'
		});
		expect(answer(result, 'support_needed')).toEqual(['treatment_cost', 'medication']);
	});

	it('drops an option retired while the form sat open, and keeps the rest', async () => {
		const result = await validate({
			...completeAnswers,
			support_needed: ['treatment_cost', 'a_choice_since_removed']
		});
		expect(result.valid).toBe(true);
		expect(answer(result, 'support_needed')).toEqual(['treatment_cost']);
	});

	it('asks again when dropping retired options leaves a required field empty', async () => {
		const result = await validate({
			...completeAnswers,
			support_needed: ['a_choice_since_removed']
		});
		expect(result.valid).toBe(false);
		expect(messagesFor(result.errors, 'support_needed')).toMatch(/tick at least one/i);
	});

	it('does not let the same box counted twice become two answers', async () => {
		const result = await validate({
			...completeAnswers,
			support_needed: ['medication', 'medication']
		});
		expect(answer(result, 'support_needed')).toEqual(['medication']);
	});
});

describe('every generated message reads like a person wrote it', () => {
	/**
	 * A message stutters when a distinctive word from the label appears *again*
	 * after the label itself — "Phone number must be a valid phone number".
	 * Quoting the label once is the point; quoting it twice is the bug.
	 */
	const stutters = (message: string, label: string) => {
		const rest = message.toLowerCase().replace(label.toLowerCase(), '');
		return label
			.toLowerCase()
			.replace(/[^a-z\s]/g, '')
			.split(/\s+/)
			.filter((word) => word.length > 3)
			.some((word) => rest.includes(word));
	};

	it('never repeats the field label inside its own message', async () => {
		const result = await validate({
			...completeAnswers,
			phone: 'call me',
			email: 'almaz at example',
			story: 'help',
			full_name: ''
		});

		const form = testForm();
		for (const [key, label] of [
			['phone', 'Phone number'],
			['email', 'Email address'],
			['story', 'Tell us what is happening'],
			['full_name', 'Your full name']
		] as const) {
			void form;
			const message = messagesFor(result.errors, key);
			expect(message, `${key}: ${message}`).not.toBe('');
			expect(stutters(message, label), `${key}: ${message}`).toBe(false);
		}
	});

	it('shows a phone number the way one should be typed', async () => {
		const result = await validate({ ...completeAnswers, phone: 'call me' });
		expect(messagesFor(result.errors, 'phone')).toMatch(/09\d/);
	});

	it('shows what an email address looks like', async () => {
		const result = await validate({ ...completeAnswers, email: 'almaz at example' });
		expect(messagesFor(result.errors, 'email')).toMatch(/@/);
	});
});

describe('answers typed or pasted the way people really do', () => {
	it('accepts an email address pasted with spaces around it', async () => {
		// Zod 4 does not trim before matching an address, so this used to be
		// rejected as a typo on an address that was perfectly correct.
		const result = await validate({ ...completeAnswers, email: '  almaz@example.com  ' });
		expect(result.valid).toBe(true);
	});

	it('stores an email address in lower case whatever was typed', async () => {
		const result = await validate({ ...completeAnswers, email: 'Almaz@Example.COM' });
		expect(answer(result, 'email')).toBe('almaz@example.com');
	});

	it('trims a name typed with a trailing space', async () => {
		const result = await validate({ ...completeAnswers, full_name: 'Almaz Bekele ' });
		expect(answer(result, 'full_name')).toBe('Almaz Bekele');
	});

	it('accepts a phone number written with a country code', async () => {
		const result = await validate({ ...completeAnswers, phone: '+251 911 234 567' });
		expect(result.valid).toBe(true);
	});
});

describe('a form that only the builder could produce', () => {
	/**
	 * Superforms works out a form's default values by walking the schema when
	 * the page *renders*. A multi-type union with no default of its own throws
	 * there — so a schema that validates submissions perfectly can still take
	 * the public page down with a 500 before anyone types a character.
	 *
	 * That is not hypothetical: a coordinator had added a required dropdown
	 * ("How did you hear about us?") and a required number ("children in
	 * school") to the seeded Medical Hardship form through the builder, and
	 * those two fields alone were enough. Building defaults is the test.
	 */
	const buildsDefaults = (fields: RenderField[]) => () =>
		defaults(zod4(buildSchema(testForm({ fields }))));

	it('renders with a required dropdown on it', () => {
		expect(
			buildsDefaults([
				field({
					key: 'referred_by',
					label: 'How did you hear about us?',
					type: 'select',
					required: true,
					options: [
						{ value: 'hospital', label: 'A hospital or clinic' },
						{ value: 'friend', label: 'A friend or neighbour' }
					]
				})
			])
		).not.toThrow();
	});

	it('renders with a required number on it', () => {
		expect(
			buildsDefaults([
				field({
					key: 'children_in_school',
					label: 'How many children are in school?',
					type: 'number',
					required: true,
					validation: { min: 0, max: 20 }
				})
			])
		).not.toThrow();
	});

	it('renders with one of every field type on it', () => {
		const everyType: RenderField[] = [
			field({ key: 'a', label: 'Text', type: 'text', required: true }),
			field({ key: 'b', label: 'Long answer', type: 'textarea', required: true }),
			field({ key: 'c', label: 'A number', type: 'number', required: true }),
			field({ key: 'd', label: 'A date', type: 'date', required: true }),
			field({
				key: 'e',
				label: 'Pick one',
				type: 'select',
				required: true,
				options: [{ value: 'x', label: 'X' }]
			}),
			field({
				key: 'f',
				label: 'Pick some',
				type: 'multiselect',
				required: true,
				options: [{ value: 'y', label: 'Y' }]
			}),
			field({ key: 'g', label: 'Agree', type: 'checkbox', required: true }),
			field({ key: 'h', label: 'A file', type: 'file_upload', required: true }),
			field({ key: 'i', label: 'Phone', type: 'phone', required: true }),
			field({ key: 'j', label: 'Email', type: 'email', required: true }),
			field({ key: 'k', label: 'A section', type: 'heading' })
		];

		expect(buildsDefaults(everyType)).not.toThrow();
		// And again with every one of them optional, which is a different walk.
		expect(buildsDefaults(everyType.map((f) => ({ ...f, required: false })))).not.toThrow();
	});

	it('does not read a blank required number as a confident zero', async () => {
		const form = testForm({
			fields: [
				...testForm().fields,
				field({
					key: 'children_in_school',
					label: 'How many children are in school?',
					type: 'number',
					required: true,
					validation: { min: 0, max: 20 }
				})
			]
		});

		// `z.coerce.number()` reads `''` as 0, so without the blank being stripped
		// first this submission would be *accepted* and filed as "no children in
		// school" — a fact nobody stated. What matters is that it is refused; the
		// 0 Superforms echoes back into `data` for a rejected field is never
		// stored, because a rejected submission is never stored.
		const result = await validate({ ...completeAnswers, children_in_school: '' }, form);
		expect(result.valid).toBe(false);
		expect(messagesFor(result.errors, 'children_in_school')).toMatch(/please answer/i);
	});

	it('accepts a required dropdown once a choice is made', async () => {
		const form = testForm({
			fields: [
				...testForm().fields,
				field({
					key: 'referred_by',
					label: 'How did you hear about us?',
					type: 'select',
					required: true,
					options: [{ value: 'hospital', label: 'A hospital or clinic' }]
				})
			]
		});

		const result = await validate({ ...completeAnswers, referred_by: 'hospital' }, form);
		expect(result.valid).toBe(true);
	});

	it('asks again when a required dropdown was never touched', async () => {
		const form = testForm({
			fields: [
				...testForm().fields,
				field({
					key: 'referred_by',
					label: 'How did you hear about us?',
					type: 'select',
					required: true,
					options: [{ value: 'hospital', label: 'A hospital or clinic' }]
				})
			]
		});

		const result = await validate({ ...completeAnswers, referred_by: '' }, form);
		expect(result.valid).toBe(false);
		expect(messagesFor(result.errors, 'referred_by')).toMatch(/choose/i);
	});
});

describe('one problem, one message', () => {
	/**
	 * A field that fails several checks at once used to report all of them, and
	 * the error summary ran them together: an empty "what is the medical
	 * situation?" told the applicant their answer was too short *and* that they
	 * had not answered — in that order, on one line, separated by a comma.
	 * Someone who has written nothing must simply be asked to write something.
	 */
	const messageCount = (errors: Record<string, unknown>, key: string) => {
		const entry = (errors as Record<string, unknown>)[key];
		return Array.isArray(entry) ? entry.length : entry ? 1 : 0;
	};

	it('asks an empty required question once, not twice', async () => {
		const result = await validate({ ...completeAnswers, story: '' });
		expect(messageCount(result.errors, 'story')).toBe(1);
		expect(messagesFor(result.errors, 'story')).toMatch(/please answer/i);
	});

	it('mentions the length only once something has been written', async () => {
		const result = await validate({ ...completeAnswers, story: 'help' });
		expect(messageCount(result.errors, 'story')).toBe(1);
		expect(messagesFor(result.errors, 'story')).toMatch(/at least 20 characters/i);
	});

	it('does not also complain about the pattern when the box is empty', async () => {
		const form = testForm({
			fields: [
				...testForm().fields,
				field({
					key: 'id_number',
					label: 'ID number',
					type: 'text',
					required: true,
					validation: { pattern: '^[0-9]{6}$', patternMessage: 'Six digits, no spaces' }
				})
			]
		});

		const result = await validate({ ...completeAnswers, id_number: '' }, form);
		expect(messageCount(result.errors, 'id_number')).toBe(1);
		expect(messagesFor(result.errors, 'id_number')).toMatch(/please answer/i);
	});

	it('uses the message staff wrote for their own pattern', async () => {
		const form = testForm({
			fields: [
				...testForm().fields,
				field({
					key: 'id_number',
					label: 'ID number',
					type: 'text',
					required: true,
					validation: { pattern: '^[0-9]{6}$', patternMessage: 'Six digits, no spaces' }
				})
			]
		});

		const result = await validate({ ...completeAnswers, id_number: 'abc' }, form);
		expect(messagesFor(result.errors, 'id_number')).toBe('Six digits, no spaces');
	});

	it('survives a pattern that is not a valid regular expression', async () => {
		// Typed into the dashboard by someone who is not a programmer. It must
		// stop constraining the field, not 500 the public form.
		const form = testForm({
			fields: [
				...testForm().fields,
				field({
					key: 'id_number',
					label: 'ID number',
					type: 'text',
					validation: { pattern: '([unclosed' }
				})
			]
		});

		const result = await validate({ ...completeAnswers, id_number: 'anything' }, form);
		expect(result.valid).toBe(true);
	});

	it('does not answer a required dropdown on the applicant’s behalf', async () => {
		// A bare `z.enum` defaults to its first member, so the control rendered
		// with an answer already in it and every submission carried a referral
		// source nobody had given.
		const form = testForm({
			fields: [
				field({
					key: 'referred_by',
					label: 'Who told you about us?',
					type: 'select',
					required: true,
					options: [
						{ value: 'hospital', label: 'A hospital or clinic' },
						{ value: 'friend', label: 'A friend or neighbour' }
					]
				})
			]
		});

		const rendered = defaults(zod4(buildSchema(form)));
		expect(answer(rendered, 'referred_by') ?? '').toBe('');
	});
});
