import { error, fail } from '@sveltejs/kit';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod/v4';
import { db } from '$lib/server/db';
import { formDefinitions, formFields } from '$lib/server/db/schema';
import { requirePermission } from '$lib/server/permissions';
import { flagField } from '$lib/server/crud';
import { invalidateForms, loadForm } from '$lib/server/forms';
import { audit } from '$lib/server/audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * The form builder.
 *
 * §5.4 calls this the highest-value custom screen in the system, and it is:
 * this is what lets a program manager add or change a question on the Medical
 * Hardship form without a developer. Everything it writes is read back by the
 * schema generator on the very next public request — there is no build step
 * and no cache to wait on beyond the one this route drops.
 *
 * The live preview is the same `DynamicForm` component the public site uses,
 * fed the same `RenderForm`, so what a manager sees while editing is literally
 * what an applicant will see.
 */
export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'forms.manage');
	const id = Number(event.params.id);
	if (!Number.isFinite(id)) throw error(404, 'Not found');

	const [definition] = await db
		.select()
		.from(formDefinitions)
		.where(and(eq(formDefinitions.id, id), isNull(formDefinitions.deletedAt)))
		.limit(1);

	if (!definition) throw error(404, 'That form does not exist.');

	const fields = await db
		.select()
		.from(formFields)
		.where(and(eq(formFields.formDefinitionId, id), isNull(formFields.deletedAt)))
		.orderBy(asc(formFields.sortOrder), asc(formFields.id));

	audit({ event, action: 'viewed', entityType: 'form_definition', entityId: id });

	return {
		/** Names this page in the breadcrumb above it. */
		crumb: definition.name,
		definition,
		fields,
		// The preview is built through the same loader the public route uses, so
		// a discrepancy between preview and reality is impossible by construction.
		preview: await loadForm(definition.slug)
	};
};

const optionSchema = z.array(
	z.object({
		value: z.string().trim().min(1).max(100),
		label: z.string().trim().min(1).max(200)
	})
);

const fieldSchema = z.object({
	fieldKey: z
		.string()
		.trim()
		.min(1, 'Required')
		.max(60)
		.regex(
			/^[a-z][a-z0-9_]*$/,
			'Start with a letter; lower-case letters, numbers and underscores only'
		),
	label: z.string().trim().min(1, 'Required').max(200),
	hint: z.string().trim().max(500).optional(),
	placeholder: z.string().trim().max(200).optional(),
	fieldType: z.enum([
		'text',
		'textarea',
		'number',
		'date',
		'select',
		'multiselect',
		'checkbox',
		'file_upload',
		'phone',
		'email',
		'heading'
	]),
	isRequired: flagField(false),
	showWhenFieldKey: z.string().trim().max(60).optional(),
	showWhenValue: z.string().trim().max(100).optional(),
	mapsTo: z.enum(['name', 'phone', 'email', 'region']).optional(),
	minLength: z.coerce.number().int().min(0).optional(),
	maxLength: z.coerce.number().int().min(1).optional(),
	min: z.coerce.number().optional(),
	max: z.coerce.number().optional(),
	pattern: z.string().trim().max(200).optional(),
	patternMessage: z.string().trim().max(200).optional(),
	/** One `value|Label` per line — the shape a select needs. */
	optionsText: z.string().max(4000).optional()
});

/** Turns the one-per-line options textarea into the JSON the field stores. */
function parseOptions(text: string | undefined) {
	if (!text?.trim()) return null;

	const parsed = text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => {
			const [value, label] = line.split('|').map((part) => part.trim());
			// A line with no pipe is both the value and the label, which is what
			// someone typing a quick list expects.
			return { value: value || label, label: label || value };
		});

	const result = optionSchema.safeParse(parsed);
	return result.success ? result.data : null;
}

/** Only the validation keys that were actually filled in reach the database. */
function buildValidation(data: z.infer<typeof fieldSchema>) {
	const validation: Record<string, unknown> = {};
	for (const key of ['minLength', 'maxLength', 'min', 'max'] as const) {
		if (data[key] != null && !Number.isNaN(data[key])) validation[key] = data[key];
	}
	if (data.pattern) {
		// A malformed pattern must not reach the public form, where it would
		// either throw or silently stop validating.
		try {
			new RegExp(data.pattern);
			validation.pattern = data.pattern;
			if (data.patternMessage) validation.patternMessage = data.patternMessage;
		} catch {
			return { validation, patternError: 'That is not a valid pattern.' };
		}
	}
	return { validation: Object.keys(validation).length ? validation : null, patternError: null };
}

async function guard(event: Parameters<PageServerLoad>[0]) {
	await requirePermission(event, 'forms.manage');
	const id = Number(event.params.id);

	const [definition] = await db
		.select({ id: formDefinitions.id, slug: formDefinitions.slug })
		.from(formDefinitions)
		.where(eq(formDefinitions.id, id))
		.limit(1);

	if (!definition) throw error(404, 'That form does not exist.');
	return definition;
}

export const actions: Actions = {
	addField: async (event) => {
		const definition = await guard(event as never);
		const raw = Object.fromEntries(await event.request.formData());
		const parsed = fieldSchema.safeParse(raw);

		if (!parsed.success) {
			return fail(400, { error: parsed.error.issues[0]?.message ?? 'Check the field details.' });
		}

		const { validation, patternError } = buildValidation(parsed.data);
		if (patternError) return fail(400, { error: patternError });

		// Appended at the end; reordering is its own action.
		const [{ next }] = await db
			.select({ next: sql<number>`coalesce(max(sort_order), -1) + 1` })
			.from(formFields)
			.where(eq(formFields.formDefinitionId, definition.id));

		try {
			await db.insert(formFields).values({
				formDefinitionId: definition.id,
				fieldKey: parsed.data.fieldKey,
				label: parsed.data.label,
				hint: parsed.data.hint || null,
				placeholder: parsed.data.placeholder || null,
				fieldType: parsed.data.fieldType,
				options: parseOptions(parsed.data.optionsText),
				isRequired: parsed.data.isRequired,
				validation: validation as never,
				showWhenFieldKey: parsed.data.showWhenFieldKey || null,
				showWhenValue: parsed.data.showWhenValue || null,
				mapsTo: parsed.data.mapsTo ?? null,
				sortOrder: next
			});
		} catch (err) {
			// The unique index on (form, field_key) is the likely cause.
			console.error('add field failed', err);
			return fail(409, {
				error: `A question with the key "${parsed.data.fieldKey}" already exists.`
			});
		}

		invalidateForms(definition.slug);
		audit({
			event,
			action: 'created',
			entityType: 'form_field',
			entityId: definition.id,
			metadata: { fieldKey: parsed.data.fieldKey }
		});

		return { ok: true };
	},

	updateField: async (event) => {
		const definition = await guard(event as never);
		const raw = Object.fromEntries(await event.request.formData());
		const fieldId = Number(raw.fieldId);
		const parsed = fieldSchema.safeParse(raw);

		if (!Number.isFinite(fieldId) || !parsed.success) {
			return fail(400, {
				error: parsed.success ? 'Unknown question.' : parsed.error.issues[0]?.message
			});
		}

		const { validation, patternError } = buildValidation(parsed.data);
		if (patternError) return fail(400, { error: patternError });

		await db
			.update(formFields)
			.set({
				// `fieldKey` is deliberately not editable here: it is the key every
				// existing answer is stored under, and renaming it would orphan every
				// answer already given. Delete and re-add if it truly must change.
				label: parsed.data.label,
				hint: parsed.data.hint || null,
				placeholder: parsed.data.placeholder || null,
				fieldType: parsed.data.fieldType,
				options: parseOptions(parsed.data.optionsText),
				isRequired: parsed.data.isRequired,
				validation: validation as never,
				showWhenFieldKey: parsed.data.showWhenFieldKey || null,
				showWhenValue: parsed.data.showWhenValue || null,
				mapsTo: parsed.data.mapsTo ?? null,
				updatedAt: new Date()
			})
			.where(and(eq(formFields.id, fieldId), eq(formFields.formDefinitionId, definition.id)));

		invalidateForms(definition.slug);
		audit({ event, action: 'updated', entityType: 'form_field', entityId: fieldId });

		return { ok: true };
	},

	/**
	 * Soft-deletes a question.
	 *
	 * The answers already given to it stay in `form_submissions.data` — removing
	 * a question must not erase what people told us. The case detail view keys
	 * off the field rows, so a removed question's answers stop being displayed;
	 * they remain in the record and in exports.
	 */
	deleteField: async (event) => {
		const definition = await guard(event as never);
		const formData = await event.request.formData();
		const fieldId = Number(formData.get('fieldId'));

		if (!Number.isFinite(fieldId)) return fail(400, { error: 'Unknown question.' });

		await db
			.update(formFields)
			.set({ deletedAt: new Date(), isActive: false })
			.where(and(eq(formFields.id, fieldId), eq(formFields.formDefinitionId, definition.id)));

		invalidateForms(definition.slug);
		audit({ event, action: 'deleted', entityType: 'form_field', entityId: fieldId });

		return { ok: true };
	},

	/** Applies a new order from the drag-reorder list, as one ordered id list. */
	reorder: async (event) => {
		const definition = await guard(event as never);
		const formData = await event.request.formData();
		const order = String(formData.get('order') ?? '')
			.split(',')
			.map(Number)
			.filter(Number.isFinite);

		if (order.length === 0) return fail(400, { error: 'Nothing to reorder.' });

		db.transaction((tx) => {
			order.forEach((fieldId, index) => {
				tx.update(formFields)
					.set({ sortOrder: index })
					.where(and(eq(formFields.id, fieldId), eq(formFields.formDefinitionId, definition.id)))
					.run();
			});
		});

		invalidateForms(definition.slug);
		audit({
			event,
			action: 'updated',
			entityType: 'form_definition',
			entityId: definition.id,
			metadata: { reordered: true }
		});

		return { ok: true };
	}
};
