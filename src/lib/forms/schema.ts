import { z } from 'zod/v4';
import { emailField, flagField } from '$lib/forms/fields';
import { messages } from '$lib/forms/messages';
import { ACCEPTED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '$lib/forms/uploads';
import { optionalEmailField } from '$lib/forms/fields';
import type { RenderField, RenderForm } from '$lib/forms/types';

/**
 * Turning a form definition into a Zod schema.
 *
 * This is the half of the form engine that has no business touching the
 * database, and it lives outside `$lib/server` for two reasons. The renderer
 * can build the same schema in the browser, so a mistake can be caught before
 * a round trip; and the generator can be tested against a real `FormData`
 * without standing up SQLite. `$lib/server/forms` still re-exports everything
 * here, so existing imports are unchanged.
 *
 * The rule that shapes the whole file: **the schema has to survive what a
 * browser actually posts**, which is never the clean object a unit test would
 * hand it. Every control posts a string. An untouched text input posts `''`,
 * not `undefined`. An untouched file input posts a zero-byte `File`, not
 * nothing. An unticked checkbox mirrored into a hidden input posts the string
 * `"false"`. Each of those has its own trap, and each is handled below with a
 * note saying which.
 */

/* ==========================================================================
   Ceilings the builder does not let an admin set
   ========================================================================== */

/**
 * A `maxLength` typed into the dashboard bounds a text or textarea field, but
 * nothing in the builder describes how long a select value or a multi-select
 * list may be — so those get a fixed cap here rather than none at all. Without
 * one, any dynamic form is an open text box with a validator in front of it.
 */
const MAX_SHORT_TEXT = 500;
const MAX_LONG_TEXT = 5000;
const MAX_CHOICES = 100;

/** Phone numbers as people actually write them in Ethiopia: 09…, +2519…, 9…. */
const PHONE_PATTERN = /^\+?[0-9\s\-()]{7,20}$/;

/* ==========================================================================
   Field-level helpers

   Each of these exists because a browser posts something a naive schema
   mishandles. They are named for the problem rather than the type, so the
   switch below reads as a list of decisions.
   ========================================================================== */

/**
 * An optional text field, where "left blank" must mean *blank*.
 *
 * `.optional()` alone is not enough: an untouched input posts `''`, which is a
 * present value and fails a `.min(1)` — the classic way a dynamic form ends up
 * rejecting a field nobody was required to fill in. The empty string is
 * matched first and mapped to `undefined`, so a blank answer is stored as an
 * absent one rather than as an empty string that later renders as a stray
 * label with nothing under it.
 */
const blankable = <T extends z.ZodType<string>>(schema: T) =>
	z
		.union([z.literal(''), z.null(), z.undefined(), schema])
		.optional()
		.transform((value) => (value === '' || value === null ? undefined : value));

/**
 * A number question, required or not, with every case reporting the right thing.
 *
 * Numbers are the field type where the obvious schema is wrong in the most
 * ways at once, so this is spelled out rather than composed:
 *
 * - **`z.coerce.number()` reads `''` as 0.** Left to itself, "how many children
 *   are in school?" skipped entirely is stored as a confident zero — and on a
 *   *required* field it passes validation, so nothing ever flags it.
 * - **A `z.union` cannot be parsed out of multipart `FormData`.** Superforms
 *   refuses it outright ("Unions are only supported when dataType is json")
 *   unless a `.transform()` follows and makes the type opaque to it.
 * - **A multi-type union with no default throws while the page renders.** Not
 *   on submit — on render, before anybody types anything.
 * - **Checks inside a union lose their messages.** The union reports its own
 *   generic failure, so a `min` written for a person comes back as
 *   "Too big: expected number to be <=20".
 *
 * Taking the value as `unknown`, normalising it once, and then judging it in a
 * single `superRefine` sidesteps all four: there is one type for Superforms to
 * reason about, one place a blank is recognised, and every message is the one
 * written for that field.
 */
const numberField = (label: string, options: { required: boolean; min?: number; max?: number }) =>
	z
		.unknown()
		.transform((raw) => {
			if (raw === null || raw === undefined) return undefined;
			if (typeof raw === 'number') return raw;
			const text = String(raw).trim();
			// A blank is an unanswered question, never a zero.
			return text === '' ? undefined : Number(text);
		})
		.superRefine((value, ctx) => {
			if (value === undefined) {
				if (options.required) ctx.addIssue({ code: 'custom', message: messages.required(label) });
				return;
			}
			if (!Number.isFinite(value)) {
				ctx.addIssue({ code: 'custom', message: messages.number(label) });
				return;
			}
			if (options.min !== undefined && value < options.min) {
				ctx.addIssue({ code: 'custom', message: messages.min(label, options.min) });
			}
			if (options.max !== undefined && value > options.max) {
				ctx.addIssue({ code: 'custom', message: messages.max(label, options.max) });
			}
		});

/**
 * A single-choice question, required or not.
 *
 * Built the same way as `numberField`, and for one blunt reason: a bare
 * `z.enum` **answers the question itself**. Superforms takes a form's default
 * values from the schema, and an enum's first member is its default — so a
 * required "Who told you about us?" rendered with "A hospital or clinic"
 * already selected, and an applicant who never touched the control still
 * submitted that answer. Every case file got a referral source nobody had
 * given, indistinguishable from one somebody chose.
 *
 * Taking the value as `unknown` leaves the default undefined, so the control
 * starts genuinely empty, and the membership check moves into a `superRefine`
 * where it can say something useful.
 */
const choiceField = (label: string, values: string[], required: boolean) =>
	z
		.unknown()
		.transform((raw) => {
			if (raw === null || raw === undefined) return undefined;
			const text = String(raw).trim();
			return text === '' ? undefined : text;
		})
		.superRefine((value, ctx) => {
			if (value === undefined) {
				if (required) ctx.addIssue({ code: 'custom', message: messages.chooseOne(label) });
				return;
			}
			if (!values.includes(value)) {
				ctx.addIssue({ code: 'custom', message: messages.notAnOption(label) });
			}
		});

/**
 * A free-text question — one line or many — reporting one problem at a time.
 *
 * Chaining `.min(1, 'please answer')` after `.min(20, 'write a little more')`
 * looks right and is not: Zod collects *every* failing check, so an empty
 * required box returned both, and the error summary showed "please write a
 * little more (at least 20 characters),Please answer: What is the medical
 * situation?" as a single run-on line. Someone who had written nothing was
 * being told, first, that what they had written was too short.
 *
 * The checks are ordered here instead, and stop at the first one that fires.
 */
const textField = (
	label: string,
	options: {
		required: boolean;
		minLength?: number;
		maxLength: number;
		pattern?: string;
		patternMessage?: string;
	}
) => {
	let expression: RegExp | null = null;
	if (options.pattern) {
		try {
			expression = new RegExp(options.pattern);
		} catch {
			// A malformed pattern typed into the dashboard must not 500 the public
			// form; it just stops constraining that field.
			console.warn(`Invalid regex on a form field: ${options.pattern}`);
		}
	}

	return (
		z
			.unknown()
			.transform((raw) => (raw === null || raw === undefined ? '' : String(raw).trim()))
			.superRefine((value, ctx) => {
				if (value === '') {
					if (options.required) ctx.addIssue({ code: 'custom', message: messages.required(label) });
					return;
				}
				if (options.minLength !== undefined && value.length < options.minLength) {
					ctx.addIssue({ code: 'custom', message: messages.tooShort(label, options.minLength) });
					return;
				}
				if (value.length > options.maxLength) {
					ctx.addIssue({ code: 'custom', message: messages.tooLong(label, options.maxLength) });
					return;
				}
				if (expression && !expression.test(value)) {
					ctx.addIssue({
						code: 'custom',
						message: options.patternMessage?.trim() || messages.pattern(label)
					});
				}
			})
			// A blank optional answer is stored as absent, not as an empty string that
			// later renders as a label with nothing under it.
			.transform((value) => (value === '' ? undefined : value))
	);
};

/**
 * An untouched `<input type="file">` posts a zero-byte `File` with an empty
 * name — not nothing at all. So an optional upload has to treat that as
 * "nothing was attached" *before* any size or type check runs, or every
 * optional attachment reports "please attach a file" on a form nobody touched.
 */
const isEmptyFile = (value: unknown) => value instanceof File && value.size === 0;

/* ==========================================================================
   One field
   ========================================================================== */

function fieldSchema(field: RenderField): z.ZodTypeAny {
	const v = field.validation ?? {};
	const required = field.required;
	const label = field.label;

	switch (field.type) {
		case 'heading':
			// Not an input; contributes nothing to the payload.
			return z.any().optional();

		case 'number':
			return numberField(label, {
				required,
				min: v.min ?? undefined,
				max: v.max ?? undefined
			});

		case 'checkbox': {
			// A required checkbox means "must be ticked" — a consent box.
			//
			// `flagField`, never `z.coerce.boolean()`: the renderer mirrors the box
			// into a hidden input, so an unticked box posts the string `"false"` —
			// which coercion turns into `true`, storing the opposite of what was
			// ticked and letting a direct POST of `consent=false` satisfy the
			// `.refine` below.
			return required
				? flagField(false).refine((value) => value === true, messages.tickBox(label))
				: flagField(false);
		}

		case 'date': {
			const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, messages.date(label));
			return required ? date : blankable(date);
		}

		case 'email': {
			/*
			 * No `.trim()` or `.transform()` on this, deliberately.
			 *
			 * Zod 4's `z.email()` does not apply a `.trim()` before it matches, so
			 * the trim would not help anyway; and a `.transform()` placed inside
			 * the union `blankable` builds makes the whole branch opaque, so a
			 * mistyped address reports the union's generic "Invalid input" instead
			 * of the message written for it. Both jobs — trimming what was pasted,
			 * lower-casing what is stored — are done by `normaliseFormData` before
			 * validation starts.
			 */
			const email = emailField(messages.email(label));
			return required ? email : blankable(email);
		}

		case 'phone': {
			const phone = z
				.string()
				.trim()
				.max(20, messages.phone(label))
				.regex(PHONE_PATTERN, messages.phone(label));
			return required ? phone : blankable(phone);
		}

		case 'select': {
			const values = field.options.map((option) => option.value);

			// A select whose options were never filled in degrades to free text, so
			// it needs the same ceiling every other text field gets.
			if (values.length === 0) {
				const text = z.string().trim().max(MAX_SHORT_TEXT, messages.tooLong(label, MAX_SHORT_TEXT));
				return required ? text.min(1, messages.required(label)) : blankable(text);
			}

			return choiceField(label, values, required);
		}

		case 'multiselect': {
			const values = field.options.map((option) => option.value);

			/**
			 * This must stay a plain `z.array()` with **no `.transform()` anywhere
			 * in the chain**, and that is load-bearing rather than stylistic.
			 *
			 * Superforms decides how to read a key out of `FormData` by inspecting
			 * the schema's type: an array makes it call `getAll()`, anything else
			 * makes it call `get()`. A `.transform()` — even one buried inside a
			 * `.pipe()` — makes the type opaque and silently sends it down the
			 * `get()` path.
			 *
			 * That is exactly what used to happen here. The schema was a union of
			 * array and string, so a group of checkboxes posting `support_needed`
			 * three times was read with `get()` and collapsed to whichever box was
			 * ticked **last**. An applicant who ticked "treatment costs",
			 * "medication" and "transport" had a case file that said "transport" —
			 * with no error, no warning, and nothing in the payload to suggest the
			 * other two had ever been there. A caseworker reading that file had no
			 * way to know it was wrong.
			 *
			 * Everything that would want a transform — splitting a legacy
			 * comma-joined value, dropping an option that has since been retired —
			 * happens in `normaliseMultiselects` before validation instead. See the
			 * note there for why that is the right place for it rather than a
			 * workaround.
			 */
			const list =
				values.length === 0
					? z.array(z.string().max(MAX_SHORT_TEXT)).max(MAX_CHOICES)
					: z.array(z.enum(values as [string, ...string[]])).max(MAX_CHOICES);

			return required ? list.min(1, messages.tickAtLeastOne(label)).default([]) : list.default([]);
		}

		case 'file_upload': {
			const file = z
				.instanceof(File, { message: messages.attachFile(label) })
				.refine((value) => value.size > 0, messages.attachFile(label))
				.refine(
					(value) => value.size <= MAX_UPLOAD_BYTES,
					messages.fileTooBig(label, MAX_UPLOAD_MB)
				)
				.refine(
					(value) => ACCEPTED_UPLOAD_TYPES.includes(value.type),
					messages.fileWrongType(label)
				);

			if (required) return file;

			// See `isEmptyFile`: the zero-byte File an untouched input posts has to
			// become "nothing attached" before any check above can fire.
			return z
				.union([z.undefined(), z.null(), z.custom<File>(isEmptyFile), file])
				.optional()
				.transform((value) => (value instanceof File && value.size > 0 ? value : undefined));
		}

		case 'textarea':
		case 'text':
		default: {
			// Clamped, not just defaulted: `maxLength` comes from the dashboard, and
			// a coordinator who types 1000000 into it should not be able to turn a
			// public field into an unbounded one.
			const ceiling = field.type === 'textarea' ? MAX_LONG_TEXT : MAX_SHORT_TEXT;
			return textField(label, {
				required,
				minLength: v.minLength ?? undefined,
				maxLength: Math.min(v.maxLength ?? ceiling, ceiling),
				pattern: v.pattern,
				patternMessage: v.patternMessage
			});
		}
	}
}

/* ==========================================================================
   The whole form
   ========================================================================== */

/**
 * The full Zod schema for a form: its dynamic fields, plus the fixed contact
 * columns every submission carries and an anti-spam honeypot.
 *
 * Contact details are optional at the schema level in every case — the form
 * can require them through a mapped field, and a low-barrier form must be able
 * to accept a submission with nothing but a description.
 */
export function buildSchema(form: RenderForm) {
	const shape: Record<string, z.ZodTypeAny> = {};
	for (const field of form.fields) {
		if (field.type === 'heading') continue;
		shape[field.key] = fieldSchema(field);
	}

	return z.object({
		...shape,
		submittedByName: z.string().trim().max(150).optional().or(z.literal('')),
		submittedByPhone: z.string().trim().max(32).optional().or(z.literal('')),
		submittedByEmail: optionalEmailField(),
		/**
		 * Honeypot. Bots fill every input they find; a human never sees this one,
		 * so any value at all means the submission is discarded silently.
		 */
		website: z.string().max(200).optional().or(z.literal(''))
	});
}

export type SubmissionSchema = ReturnType<typeof buildSchema>;

/* ==========================================================================
   Making a real request fit the schema
   ========================================================================== */

/**
 * Fixes up a posted body before it is validated.
 *
 * The multiselect schema above cannot contain a `.transform()` — that is what
 * makes Superforms read repeated fields with `getAll()` instead of silently
 * keeping only the last one. So the two corrections a multiselect answer may
 * need are applied here, to the `FormData`, before validation ever starts:
 *
 * 1. **A comma-joined value is split.** Older renderers posted the whole
 *    selection as one hidden input holding `a,b,c`, and a page cached in
 *    someone's browser still does. Splitting here means such a post keeps
 *    working rather than failing as "not one of the options".
 * 2. **A retired option is dropped.** Someone who left the form open overnight
 *    while a coordinator removed a choice would otherwise have their whole
 *    application rejected over a box they ticked in good faith. Only known
 *    values are ever stored, so dropping loses nothing — and if a *required*
 *    field ends up empty as a result, the schema still says "please tick at
 *    least one", which is the message that actually helps.
 *
 * This is not a workaround for the schema's shape. Correcting the wire format
 * is genuinely the transport layer's job, and doing it here keeps one shape of
 * answer — a clean array of known values — reaching the validator from every
 * caller.
 */
/** The field types whose answer is text a person may have pasted. */
const TRIMMED_TYPES = new Set<RenderField['type']>([
	'text',
	'textarea',
	'email',
	'phone',
	'date',
	'select',
	'number'
]);

export function normaliseFormData(form: RenderForm, body: FormData): FormData {
	for (const field of form.fields) {
		/*
		 * Whitespace first, for every text-ish field.
		 *
		 * Someone who pastes an address out of an email brings the spaces with
		 * it, and Zod 4's `z.email()` does not trim before it matches — so
		 * " almaz@example.com " was rejected as malformed, with a message about
		 * typos, on an address that was perfectly correct. A `.trim()` on the
		 * schema cannot fix that (it runs after the check), and a `.transform()`
		 * would break the messages, so the trim belongs here.
		 *
		 * Email is lower-cased at the same time: the same person writing
		 * "Almaz@Example.com" today and "almaz@example.com" next month should be
		 * one applicant when the duplicate check runs.
		 */
		if (TRIMMED_TYPES.has(field.type)) {
			const value = body.get(field.key);
			if (typeof value === 'string') {
				const trimmed = field.type === 'email' ? value.trim().toLowerCase() : value.trim();
				if (trimmed !== value) body.set(field.key, trimmed);
			}
		}

		/*
		 * A blank on a *required* number is removed entirely.
		 *
		 * `z.coerce.number()` reads `''` as 0, so leaving it in place would mean
		 * "how many children are in school?" left untouched is recorded as a
		 * confident zero — and the field, being required, would report no problem
		 * at all. Deleting the key makes it arrive absent, which is what it is,
		 * and the schema then asks the question again.
		 */
		if (field.type === 'number' && field.required) {
			const value = body.get(field.key);
			if (typeof value === 'string' && value.trim() === '') body.delete(field.key);
		}

		if (field.type !== 'multiselect') continue;

		const posted = body
			.getAll(field.key)
			.filter((entry): entry is string => typeof entry === 'string');
		if (posted.length === 0) continue;

		const allowed = new Set(field.options.map((option) => option.value));
		const cleaned = [
			...new Set(
				posted
					.flatMap((entry) => entry.split(','))
					.map((entry) => entry.trim())
					.filter(Boolean)
					// An unconfigured multiselect has no options to check against, so
					// everything it was given stands.
					.filter((entry) => allowed.size === 0 || allowed.has(entry))
			)
		];

		body.delete(field.key);
		for (const entry of cleaned) body.append(field.key, entry);
	}

	return body;
}

/* ==========================================================================
   Conditional fields
   ========================================================================== */

/**
 * Whether a conditional field should be visible given the current answers.
 * Used on the server to strip hidden answers before storage, and mirrored on
 * the client to hide the input — the server copy is the authoritative one.
 */
export const isFieldVisible = (field: RenderField, values: Record<string, unknown>): boolean => {
	if (!field.showWhen) return true;
	const actual = values[field.showWhen.key];
	if (Array.isArray(actual)) return actual.map(String).includes(field.showWhen.value);
	return String(actual ?? '') === field.showWhen.value;
};

export { ACCEPTED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from '$lib/forms/uploads';
