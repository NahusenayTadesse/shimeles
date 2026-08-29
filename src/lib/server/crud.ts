import { superValidate, message } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { and, asc, eq, isNull, type SQL } from 'drizzle-orm';
import { z } from 'zod/v4';
import type { RequestEvent } from '@sveltejs/kit';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { db } from '$lib/server/db';
import { savePublicImage } from '$lib/server/upload';
import { audit, type AuditEntity } from '$lib/server/audit';
import {
	assertPillarAccess,
	pillarScopeOrNull,
	requirePermission,
	type Access,
	type Permission
} from '$lib/server/permissions';
import { invalidate } from '$lib/server/cache';
import { toMinor } from '$lib/money';

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
	/**
	 * The column carrying the pillar a row belongs to, for tables holding case
	 * data (§3.10).
	 *
	 * Set it and the scope is folded into the list *and* into every write — a
	 * caseworker assigned to Mental Wellness cannot list, edit or delete a
	 * Medical Hardship row, whether they clicked a link or posted the id
	 * directly. Without it a screen is unscoped, which is right for the content
	 * tables (a pillar, a translation, a status option belong to nobody) and
	 * wrong for anything hanging off a case.
	 *
	 * Rows with a *null* pillar stay visible to everyone: on `disbursements`
	 * that is a general-fund payment, which belongs to no programme rather than
	 * to a programme you cannot see. Where a null pillar would instead mean
	 * "unfiled case data", derive it in `beforeWrite` so it is never null.
	 */
	pillarColumn?: AnyTable[string];
	/**
	 * Last chance to correct the validated values before they are written.
	 *
	 * Runs after validation and after the scope check, with the row as it is on
	 * disk for an edit. For deriving a column that must not be taken from the
	 * form — `disbursements.pillar_id` is read back from the case the payment is
	 * against, so it cannot be posted as null to slip a row past the scope.
	 */
	beforeWrite?: (
		values: Record<string, any>,
		context: { event: RequestEvent; access: Access; existing?: Record<string, any> }
	) => Promise<Record<string, any>> | Record<string, any>;
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
	pillarColumn,
	beforeWrite,
	invalidates = [],
	hardDelete = false
}: CrudOptions) {
	/** Admin-chosen order where the table has one; id otherwise. */
	const orderColumn = table.sortOrder ?? table.id;
	const supportsSoftDelete = 'deletedAt' in table;
	/**
	 * The *JavaScript* property the pillar column is reached by — `pillarId`,
	 * not `pillar_id`.
	 *
	 * `column.name` is the database name, and both the things checked against it
	 * are keyed the other way: validated form data comes from a Zod schema
	 * written in camelCase, and a Drizzle `select()` row is keyed by the property
	 * on the table object. Using `column.name` looks right, reads `undefined`
	 * from both, and turns every scope check below into a silent no-op — which is
	 * the worst possible failure for a control whose whole job is to refuse.
	 */
	const pillarName: string | undefined = pillarColumn
		? Object.keys(table).find((key) => table[key] === pillarColumn)
		: undefined;

	if (pillarColumn && !pillarName) {
		throw new Error(
			`contentCrud(${label}): pillarColumn is not a column of the table it was given.`
		);
	}

	const liveRows = (event: RequestEvent, access: Access) => {
		const clauses = [filter?.(event)];
		if (pillarColumn) clauses.push(pillarScopeOrNull(access, pillarColumn));
		if (supportsSoftDelete) clauses.push(isNull(table.deletedAt));
		const where = clauses.filter(Boolean) as SQL[];
		const query = db.select().from(table);
		return (where.length ? query.where(and(...where)) : query).orderBy(asc(orderColumn));
	};

	/** The row as it is on disk, for checking what a write is about to touch. */
	const existingRow = async (id: number): Promise<Record<string, any> | undefined> => {
		if (!pillarColumn && !beforeWrite) return undefined;
		const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
		return row as Record<string, any> | undefined;
	};

	/**
	 * Refuses a write that reaches outside the user's pillars.
	 *
	 * A null pillar passes — see the note on `pillarColumn`. Both ends of an
	 * edit are checked by the callers: the row as it stands, so another
	 * programme's record cannot be edited, and the values being written, so a
	 * record cannot be pushed into a programme the user cannot see.
	 */
	const assertInScope = (event: RequestEvent, access: Access, pillarId: unknown) => {
		if (!pillarColumn || access.pillarIds === null) return;
		if (pillarId == null) return;
		assertPillarAccess(event, access, Number(pillarId));
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
		const access = await requirePermission(event, permission);

		const [addForm, editForm, deleteForm, rows] = await Promise.all([
			superValidate(zod4(addSchema)),
			superValidate(zod4(editSchema)),
			superValidate(zod4(idSchema)),
			liveRows(event, access)
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

			// Outside the try: a refusal is a 403 with a reason, not a "could not
			// add" swallowed by the catch below and reported as a server fault.
			const data = form.data as FormData;
			if (pillarName) assertInScope(event, access, data[pillarName]);

			try {
				let values = await toRow(data, access.userId);
				if (beforeWrite) {
					values = await beforeWrite(values, { event, access });
					if (pillarName) assertInScope(event, access, values[pillarName]);
				}

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

			const data = form.data as FormData;
			const existing = await existingRow(data.id);

			// Outside the try, so a refusal is a 403 with a reason rather than a
			// generic failure. Both ends are checked: the row as it stands, so
			// another programme's record cannot be edited, and the values coming in,
			// so a record cannot be pushed into a programme this user cannot see.
			if (pillarName) {
				if (!existing) return message(form, { type: 'error', text: 'Not found' }, { status: 404 });
				assertInScope(event, access, existing[pillarName]);
				assertInScope(event, access, data[pillarName]);
			}

			try {
				let values = await toRow(data, access.userId);
				if (beforeWrite) {
					values = await beforeWrite(values, { event, access, existing });
					if (pillarName) assertInScope(event, access, values[pillarName]);
				}

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

			// Outside the try — see `add`.
			if (pillarName) {
				const existing = await existingRow(id);
				if (!existing) return message(form, { type: 'error', text: 'Not found' }, { status: 404 });
				assertInScope(event, access, existing[pillarName]);
			}

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
				return message(form, {
					type: 'success',
					text: `${label} deleted`,
					// Present only when the row is still there to bring back, which
					// is what lets the toast decide whether to offer Undo. A screen
					// with its own delete action sends no such field and gets no
					// button, rather than one that would 404.
					undo: supportsSoftDelete && !hardDelete ? id : undefined
				});
			} catch (err) {
				console.error(`Failed to delete ${label}:`, err);
				return message(form, { type: 'error', text: `Could not delete ${label}` }, { status: 500 });
			}
		},

		/**
		 * Puts a soft-deleted row back.
		 *
		 * Deleting has always been a tombstone rather than a removal, and until
		 * now nothing in the dashboard could act on that: the row was still in
		 * the database and only a developer could reach it. One mistyped click
		 * on the wrong row meant an email to whoever had shell access.
		 *
		 * The same permission as deleting, and the same pillar scope, because
		 * restoring is undeleting and not a lesser act.
		 */
		restore: async (event: RequestEvent) => {
			const access = await requirePermission(event, permission);
			const form = await superValidate(event.request, zod4(idSchema));
			if (!form.valid) {
				return message(form, { type: 'error', text: 'Invalid request' }, { status: 400 });
			}

			if (!supportsSoftDelete || hardDelete) {
				return message(
					form,
					{ type: 'error', text: `A deleted ${label.toLowerCase()} cannot be brought back` },
					{ status: 400 }
				);
			}

			const { id } = form.data as FormData;

			// The scope check reads the deleted row, so it cannot go through
			// `existingRow`, which filters tombstones out.
			if (pillarName) {
				const [existing] = await db.select().from(table).where(eq(table.id, id)).limit(1);
				if (!existing) return message(form, { type: 'error', text: 'Not found' }, { status: 404 });
				assertInScope(event, access, existing[pillarName]);
			}

			try {
				await db
					.update(table)
					.set({ deletedAt: null, ...('deletedBy' in table ? { deletedBy: null } : {}) })
					.where(eq(table.id, id));

				dropCaches();
				audit({ event, action: 'restored', entityType: entity, entityId: id });
				return message(form, { type: 'success', text: `${label} restored` });
			} catch (err) {
				// Most likely a unique index: something with the same name or slug
				// has been added since, and two live rows cannot both hold it.
				console.error(`Failed to restore ${label}:`, err);
				return message(
					form,
					{
						type: 'error',
						text: `Could not bring that ${label.toLowerCase()} back — something added since may be using its name`
					},
					{ status: 500 }
				);
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
export {
	emailField,
	optionalEmailField,
	optionalNumberField,
	flagField,
	optionalFlagField
} from '$lib/forms/fields';

/** Money entered in birr, stored in santim. See `$lib/money`. */
export const moneyField = z.coerce
	.number()
	.min(0, 'Cannot be negative')
	.transform((major) => toMinor(major));
