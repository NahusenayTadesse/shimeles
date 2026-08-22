import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod/v4';
import { emailField, flagField, optionalEmailField } from '$lib/forms/fields';
import { MAX_UPLOAD_BYTES } from '$lib/server/upload';
import { db } from '$lib/server/db';
import { formDefinitions, formFields, pillars } from '$lib/server/db/schema';
import { cached, invalidate } from '$lib/server/cache';
import type {
	FieldOption,
	FieldType,
	FieldValidation,
	RenderField,
	RenderForm
} from '$lib/forms/types';

/**
 * The dynamic form engine.
 *
 * There is exactly one of these, and there are no hand-written application
 * forms anywhere in the repo. A `form_definitions` row plus its `form_fields`
 * becomes, at request time:
 *
 *   - a Zod schema (`buildSchema`) that Superforms validates against, and
 *   - a `RenderForm` (`loadForm`) that the single generic renderer draws.
 *
 * That is what makes §0's test pass for forms: a program manager adding "How
 * many children are in the household?" to the Medical Hardship form is one row
 * in `form_fields`, taking effect on the next request, with validation and
 * storage following automatically.
 */

/* ==========================================================================
   Loading
   ========================================================================== */

/** Raw rows straight from the database, before language resolution. */
async function loadRaw(slug: string) {
	return cached(`form:${slug}`, async () => {
		const [definition] = await db
			.select()
			.from(formDefinitions)
			.where(
				and(
					eq(formDefinitions.slug, slug),
					eq(formDefinitions.isActive, true),
					isNull(formDefinitions.deletedAt)
				)
			)
			.limit(1);

		if (!definition) return null;

		const [fields, pillar] = await Promise.all([
			db
				.select()
				.from(formFields)
				.where(
					and(
						eq(formFields.formDefinitionId, definition.id),
						eq(formFields.isActive, true),
						isNull(formFields.deletedAt)
					)
				)
				.orderBy(asc(formFields.sortOrder), asc(formFields.id)),
			definition.pillarId
				? db.select().from(pillars).where(eq(pillars.id, definition.pillarId)).limit(1)
				: Promise.resolve([])
		]);

		return { definition, fields, pillar: pillar[0] ?? null };
	});
}

/**
 * A form ready to render.
 *
 * Returns `null` for an unknown or deactivated slug so a route can 404 rather
 * than render an empty shell.
 *
 * v1 is English-only; the `*_am` columns on the definition and its fields are
 * left in place and unread, so restoring Amharic is a change here rather than
 * a migration.
 */
export async function loadForm(slug: string): Promise<RenderForm | null> {
	const raw = await loadRaw(slug);
	if (!raw) return null;

	const { definition, fields, pillar } = raw;

	return {
		id: definition.id,
		slug: definition.slug,
		title: definition.title,
		introText: definition.introText,
		successMessage: definition.successMessage,
		requiresDocuments: definition.requiresDocuments,
		isLowBarrier: definition.isLowBarrier,
		pillar: pillar
			? { id: pillar.id, name: pillar.name, color: pillar.color, icon: pillar.icon }
			: null,
		fields: fields.map((field): RenderField => {
			const options = (field.options ?? []).map((option): FieldOption => ({
				value: option.value,
				label: option.label
			}));

			return {
				key: field.fieldKey,
				label: field.label,
				hint: field.hint,
				placeholder: field.placeholder,
				type: field.fieldType as FieldType,
				options,
				required: isRequired(
					field.isRequired,
					field.fieldType as FieldType,
					definition.isLowBarrier
				),
				validation: (field.validation ?? {}) as FieldValidation,
				showWhen:
					field.showWhenFieldKey && field.showWhenValue != null
						? { key: field.showWhenFieldKey, value: field.showWhenValue }
						: null
			};
		})
	};
}

/** Every active public form, for the dashboard pickers and the sitemap. */
export const listForms = () =>
	cached('forms:list', () =>
		db
			.select({
				id: formDefinitions.id,
				slug: formDefinitions.slug,
				name: formDefinitions.name,
				title: formDefinitions.title,
				pillarId: formDefinitions.pillarId,
				isLowBarrier: formDefinitions.isLowBarrier
			})
			.from(formDefinitions)
			.where(and(eq(formDefinitions.isActive, true), isNull(formDefinitions.deletedAt)))
			.orderBy(asc(formDefinitions.sortOrder), asc(formDefinitions.name))
	);

/**
 * Which workflow a form's submissions enter. Read from the definition rather
 * than inferred from the slug, so a coordinator can build a second volunteer
 * form without it silently becoming an assistance application.
 */
export async function formStatusContext(slug: string): Promise<'application' | 'volunteer'> {
	const raw = await loadRaw(slug);
	return raw?.definition.statusContext ?? 'application';
}

export const invalidateForms = (slug?: string) => {
	invalidate('forms:list');
	invalidate(slug ? `form:${slug}` : 'form');
};

/* ==========================================================================
   The low-barrier guarantee
   ========================================================================== */

/**
 * A low-barrier form — Mental Wellness, per §3.3 — promises no proof of need
 * and minimal friction. That promise is enforced here rather than left to
 * whoever edits the form next: on such a form, contact details and document
 * uploads are never required, no matter what `is_required` says in the row.
 *
 * The flag lives on the *form*, so staff can still mark a question required on
 * the Medical Hardship form, where evidence genuinely is needed.
 */
const NEVER_REQUIRED_WHEN_LOW_BARRIER: FieldType[] = ['file_upload', 'phone', 'email'];

function isRequired(stored: boolean, type: FieldType, isLowBarrier: boolean): boolean {
	if (type === 'heading') return false;
	if (isLowBarrier && NEVER_REQUIRED_WHEN_LOW_BARRIER.includes(type)) return false;
	return stored;
}

/* ==========================================================================
   Schema generation
   ========================================================================== */

/**
 * Ceilings for the fields a form builder does *not* let an admin size.
 *
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

/**
 * Builds the Zod schema for one field.
 *
 * Optional fields accept the empty string rather than only `undefined`,
 * because an untouched HTML input posts `''` — insisting on `undefined` here
 * is the classic way a dynamic form ends up rejecting a blank optional field.
 */
function fieldSchema(field: RenderField): z.ZodTypeAny {
	const v = field.validation ?? {};
	const required = field.required;

	const optionalText = <T extends z.ZodTypeAny>(schema: T) =>
		required ? schema : schema.optional().or(z.literal(''));

	switch (field.type) {
		case 'heading':
			// Not an input; contributes nothing to the payload.
			return z.any().optional();

		case 'number': {
			let schema = z.coerce.number({ message: `${field.label} must be a number` });
			if (v.min != null) schema = schema.min(v.min, `${field.label} must be at least ${v.min}`);
			if (v.max != null) schema = schema.max(v.max, `${field.label} must be at most ${v.max}`);
			return required ? schema : schema.optional().or(z.literal('').transform(() => undefined));
		}

		case 'checkbox':
			// A required checkbox means "must be ticked" — a consent box.
			//
			// `flagField`, never `z.coerce.boolean()`: the renderer mirrors the box
			// into a hidden input (`InputComp.svelte`, `checkboxSingle`), so an
			// unticked box posts the string `"false"` — which coercion turns into
			// `true`, storing the opposite of what was ticked and letting a direct
			// POST of `consent=false` satisfy the `.refine` below.
			return required
				? flagField(false).refine((value) => value === true, `${field.label} is required`)
				: flagField(false);

		case 'date': {
			const schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${field.label} must be a valid date`);
			return optionalText(schema);
		}

		case 'email': {
			const schema = emailField(`${field.label} must be a valid email address`);
			return optionalText(schema);
		}

		case 'phone': {
			const schema = z
				.string()
				.max(20, `${field.label} must be a valid phone number`)
				.regex(PHONE_PATTERN, `${field.label} must be a valid phone number`);
			return optionalText(schema);
		}

		case 'select': {
			const values = field.options.map((option) => option.value);
			// A select whose options were never filled in degrades to free text,
			// so it needs the same ceiling every other text field gets.
			if (values.length === 0) return optionalText(z.string().max(MAX_SHORT_TEXT));
			const schema = z.enum(values as [string, ...string[]], {
				message: `Choose an option for ${field.label}`
			});
			return required ? schema : schema.optional().or(z.literal(''));
		}

		case 'multiselect': {
			const values = field.options.map((option) => option.value);
			const allowed = new Set(values);

			/**
			 * A multi-select arrives as an array from a JSON post and as a
			 * comma-joined string from a plain multipart form. Accepting both keeps
			 * this schema usable from the public form (multipart, because it may
			 * also carry a file) and from the dashboard alike.
			 */
			const normalise = z
				.union([
					z.array(z.string().max(MAX_SHORT_TEXT)).max(MAX_CHOICES),
					z.string().max(MAX_SHORT_TEXT * MAX_CHOICES),
					z.undefined()
				])
				.transform((value) => {
					if (value == null) return [] as string[];
					const list = Array.isArray(value) ? value : value.split(',');
					return list
						.map((item) => item.trim())
						.filter(Boolean)
						.slice(0, MAX_CHOICES);
				})
				.refine(
					(list) => values.length === 0 || list.every((item) => allowed.has(item)),
					`Choose a valid option for ${field.label}`
				);

			return required
				? normalise.refine((list) => list.length > 0, `Choose at least one ${field.label}`)
				: normalise;
		}

		case 'file_upload': {
			// Superforms hands over a File; an untouched file input yields a
			// zero-byte one, which is why size rather than presence is the test.
			const schema = z
				.instanceof(File, { message: `${field.label} is required` })
				.refine((file) => file.size > 0, `${field.label} is required`)
				.refine((file) => file.size <= MAX_UPLOAD_BYTES, `${field.label} must be under 10 MB`)
				.refine(
					(file) => ACCEPTED_UPLOAD_TYPES.includes(file.type),
					`${field.label} must be a PDF or an image`
				);
			return required ? schema : schema.optional();
		}

		case 'textarea':
		case 'text':
		default: {
			let schema = z.string().trim();
			if (required) schema = schema.min(1, `${field.label} is required`);
			if (v.minLength != null) {
				schema = schema.min(
					v.minLength,
					`${field.label} must be at least ${v.minLength} characters`
				);
			}
			// Clamped, not just defaulted: `maxLength` comes from the dashboard, and
			// a coordinator who types 1000000 into it should not be able to turn a
			// public field into an unbounded one.
			const ceiling = field.type === 'textarea' ? MAX_LONG_TEXT : MAX_SHORT_TEXT;
			schema = schema.max(Math.min(v.maxLength ?? ceiling, ceiling), `${field.label} is too long`);
			if (v.pattern) {
				try {
					schema = schema.regex(
						new RegExp(v.pattern),
						v.patternMessage ?? `${field.label} is not in the expected format`
					);
				} catch {
					// A malformed pattern typed into the dashboard must not 500 the
					// public form; it just stops constraining that field.
					console.warn(`Invalid regex on field "${field.key}": ${v.pattern}`);
				}
			}
			return optionalText(schema);
		}
	}
}

/** The storage layer owns the ceiling; re-exported so schemas read one name. */
export { MAX_UPLOAD_BYTES } from '$lib/server/upload';

export const ACCEPTED_UPLOAD_TYPES = [
	'application/pdf',
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
	'image/heic'
];

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
