import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { and, asc, eq, isNull, type SQL } from 'drizzle-orm';
import { z } from 'zod/v4';
import type { RequestEvent } from '@sveltejs/kit';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { db } from '$lib/server/db';
import { savePublicImage } from '$lib/server/upload';
import { audit, type AuditEntity } from '$lib/server/audit';
import { requirePermission, type Permission } from '$lib/server/permissions';
import { invalidate } from '$lib/server/cache';

/**
 * The generic CRUD generator.
 *
 * Adapted from the same helper in the Gifa Lounge codebase, with three changes
 * this project needs:
 *
 *  - **SQLite instead of MySQL.** `.returning()` replaces `insertId`, and the
 *    table type is `SQLiteTable`.
 *  - **Soft delete by default.** Deleting sets `deleted_at` rather than
 *    issuing a DELETE, and every list filters it out. Nothing a staff member
 *    removes from a beneficiary-adjacent table is actually gone (§3).
 *  - **Permissions and audit built in.** Every action checks a permission and
 *    writes an audit row, so a new CRUD screen cannot accidentally ship
 *    unguarded or unlogged.
 *
 * Per §2 of the spec, nearly every entity should be manageable through this
 * with a config object rather than a bespoke page. Reach for a custom screen
 * only where the spec names one: the form builder, the case board, and the
 * donation reconciliation queue.
 */

/** Every content table is keyed by an autoincrement id. */
export const idSchema = z.object({ id: z.coerce.number() });

/** Reused by every content form: the integer that decides display order. */
export const sortOrderField = z.coerce.number().int().min(0).default(0);

/**
 * A boolean that survives the several shapes HTML gives one.
 *
 * `z.coerce.boolean()` is wrong here: an unticked checkbox and a `<select>` set
 * to "No" both post the *string* `"false"`, and `Boolean("false")` is `true` —
 * which silently turns every "hide this from the site" into "show it". This
 * parses the string forms explicitly and only then falls back to truthiness.
 */
export const flagField = (fallback = true) =>
	z
		.union([z.boolean(), z.string(), z.number(), z.undefined(), z.null()])
		.default(fallback)
		.transform((value) => {
			if (typeof value === 'boolean') return value;
			if (value == null || value === '') return fallback;
			if (typeof value === 'number') return value !== 0;
			return !['false', '0', 'no', 'off'].includes(value.trim().toLowerCase());
		});

type AnyTable = SQLiteTable & Record<string, any>;
type AnySchema = z.ZodType<any, any>;
type FormData = Record<string, any> & { id: number };

interface CrudOptions {
	table: AnyTable;
	/** Singular, human-readable name used in toast messages, e.g. "Pillar". */
	label: string;
	addSchema: AnySchema;
	editSchema: AnySchema;
	/** The permission required to open or change this screen. */
	permission: Permission;
	/** What to call this in the audit log. */
	entity: AuditEntity;
	/** Fields holding an uploaded File; saved to disk and stored as a filename. */
	fileFields?: string[];
	/** Fields entered as one-per-line text and stored as a JSON string array. */
	listFields?: string[];
	/** Fields entered as raw JSON text and stored as a JSON object. */
	jsonFields?: string[];
	/** Extra WHERE applied to the list, e.g. scoping to one page's blocks. */
	filter?: (event: RequestEvent) => SQL | undefined;
	/** Cache keys to drop after a write, so the public site picks the edit up. */
	invalidates?: string[];
	/**
	 * Hard delete instead of soft. Only for pure join rows (a role/permission
	 * link) where a tombstone carries no information worth keeping.
	 */
	hardDelete?: boolean;
}

export function contentCrud({
	table,
	label,
	addSchema,
	editSchema,
	permission,
	entity,
	fileFields = [],
	listFields = [],
	jsonFields = [],
	filter,
	invalidates = [],
	hardDelete = false
}: CrudOptions) {
	/** Admin-chosen order where the table has one; id otherwise. */
	const orderColumn = table.sortOrder ?? table.id;
	const supportsSoftDelete = 'deletedAt' in table;

	const liveRows = (event: RequestEvent) => {
		const clauses = [filter?.(event)];
		if (supportsSoftDelete) clauses.push(isNull(table.deletedAt));
		const where = clauses.filter(Boolean) as SQL[];
		const query = db.select().from(table);
		return (where.length ? query.where(and(...where)) : query).orderBy(asc(orderColumn));
	};

	const dropCaches = () => invalidates.forEach((key) => invalidate(key));

	/** Turns validated form data into a row, minus anything that must not change. */
	const toRow = async (data: Record<string, any>, userId?: string) => {
		// `id` identifies the row; letting it into the SET clause would let a form
		// rewrite a record's primary key.
		const values = { ...data };
		delete values.id;

		for (const field of fileFields) {
			const file = values[field];
			// No new upload means "keep whatever is already stored".
			if (file instanceof File && file.size > 0) {
				values[field] = await savePublicImage(file, userId);
			} else {
				delete values[field];
			}
		}

		for (const field of listFields) {
			const raw = values[field];
			values[field] =
				typeof raw === 'string'
					? raw
							.split('\n')
							.map((line) => line.trim())
							.filter(Boolean)
					: (raw ?? []);
		}

		for (const field of jsonFields) {
			const raw = values[field];
			if (typeof raw !== 'string') continue;
			try {
				values[field] = raw.trim() ? JSON.parse(raw) : null;
			} catch {
				// Surfaced as a validation error by the schema; never store the string.
				values[field] = null;
			}
		}

		return values;
	};

	const load = async (event: RequestEvent) => {
		await requirePermission(event, permission);

		const [addForm, editForm, deleteForm, rows] = await Promise.all([
			superValidate(zod4(addSchema)),
			superValidate(zod4(editSchema)),
			superValidate(zod4(idSchema)),
			liveRows(event)
		]);

		audit({ event, action: 'viewed_list', entityType: entity });

		return { addForm, editForm, deleteForm, rows };
	};

	const actions = {
		add: async (event: RequestEvent) => {
			const access = await requirePermission(event, permission);
			const form = await superValidate(event.request, zod4(addSchema));
			if (!form.valid) {
				return message(
					form,
					{ type: 'error', text: 'Please check the form for errors' },
					{ status: 400 }
				);
			}

			try {
				const values = await toRow(form.data as FormData, access.userId);
				const [row] = await db
					.insert(table)
					.values({ ...values, createdBy: access.userId, updatedBy: access.userId })
					.returning({ id: table.id });

				dropCaches();
				audit({ event, action: 'created', entityType: entity, entityId: row?.id });
				return message(form, { type: 'success', text: `${label} added` });
			} catch (err) {
				console.error(`Failed to add ${label}:`, err);
				return message(form, { type: 'error', text: `Could not add ${label}` }, { status: 500 });
			}
		},

		edit: async (event: RequestEvent) => {
			const access = await requirePermission(event, permission);
			const form = await superValidate(event.request, zod4(editSchema));
			if (!form.valid) {
				return message(
					form,
					{ type: 'error', text: 'Please check the form for errors' },
					{ status: 400 }
				);
			}

			try {
				const data = form.data as FormData;
				const values = await toRow(data, access.userId);
				await db
					.update(table)
					.set({ ...values, updatedBy: access.userId, updatedAt: new Date() })
					.where(eq(table.id, data.id));

				dropCaches();
				audit({
					event,
					action: 'updated',
					entityType: entity,
					entityId: data.id,
					metadata: { fields: Object.keys(values) }
				});
				return message(form, { type: 'success', text: `${label} updated` });
			} catch (err) {
				console.error(`Failed to update ${label}:`, err);
				return message(form, { type: 'error', text: `Could not update ${label}` }, { status: 500 });
			}
		},

		delete: async (event: RequestEvent) => {
			const access = await requirePermission(event, permission);
			const form = await superValidate(event.request, zod4(idSchema));
			if (!form.valid) {
				return message(form, { type: 'error', text: 'Invalid request' }, { status: 400 });
			}

			const { id } = form.data as FormData;
			try {
				if (supportsSoftDelete && !hardDelete) {
					await db
						.update(table)
						.set({ deletedAt: new Date(), deletedBy: access.userId })
						.where(eq(table.id, id));
				} else {
					await db.delete(table).where(eq(table.id, id));
				}

				dropCaches();
				audit({ event, action: 'deleted', entityType: entity, entityId: id });
				return message(form, { type: 'success', text: `${label} deleted` });
			} catch (err) {
				console.error(`Failed to delete ${label}:`, err);
				return message(form, { type: 'error', text: `Could not delete ${label}` }, { status: 500 });
			}
		}
	};

	return { load, actions };
}

/* ==========================================================================
   Shared field schemas
   ========================================================================== */

/** Optional text that an empty input should store as null, not `''`. */
export const optionalText = (max = 500) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.transform((value) => (value ? value : null));

/** A slug: lower-case, hyphenated, stable, and used in public URLs. */
export const slugField = z
	.string()
	.trim()
	.min(1, 'Required')
	.max(120)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lower-case letters, numbers and hyphens only');

/** A foreign key from a Select, which binds a string. Empty means "none". */
export const optionalIdField = z
	.union([z.coerce.number().int().positive(), z.literal(''), z.null()])
	.optional()
	.transform((value) => (typeof value === 'number' ? value : null));

/** A required foreign key from a Select. */
export const idField = z.coerce.number().int().positive('Required');

/** Re-exported so a schema needs only one import. See `$lib/forms/fields`. */
export { optionalNumberField } from '$lib/forms/fields';

/** Money entered in birr, stored in santim. See `$lib/money`. */
export const moneyField = z.coerce
	.number()
	.min(0, 'Cannot be negative')
	.transform((major) => Math.round(major * 100));
