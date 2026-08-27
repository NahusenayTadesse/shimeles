import { and, asc, eq, isNull } from 'drizzle-orm';
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
 * Schema generation moved to `$lib/forms/schema`, which touches no database and
 * so can be imported by the renderer and tested against a real `FormData`
 * without standing up SQLite. It is re-exported here because every existing
 * caller imports it from this module, and because "the form engine" is one idea
 * even though half of it no longer needs the server.
 */
export {
	buildSchema,
	isFieldVisible,
	normaliseFormData,
	ACCEPTED_UPLOAD_TYPES,
	MAX_UPLOAD_BYTES,
	type SubmissionSchema
} from '$lib/forms/schema';

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
		acknowledgeSubmitter: definition.acknowledgeSubmitter,
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
