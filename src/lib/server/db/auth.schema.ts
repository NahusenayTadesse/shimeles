import { relations, sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/* ==========================================================================
   Column conventions
   ========================================================================== */

/**
 * SQLite has no native timestamp type. Everything below stores epoch
 * milliseconds in an INTEGER column and hands Drizzle a `Date` — which sorts
 * correctly, compares with plain `<`/`>`, and costs 8 bytes instead of a
 * 24-character ISO string.
 */
export const timestampMs = (name: string) => integer(name, { mode: 'timestamp_ms' });

/** `CURRENT_TIMESTAMP` is a string in SQLite; epoch-ms needs `unixepoch()`. */
export const nowMs = sql`(unixepoch('subsec') * 1000)`;

/**
 * The audit envelope carried by every staff-authored table.
 *
 * `deletedAt` is what makes deletion soft: the generic CRUD layer filters on
 * it rather than issuing a DELETE, so nothing a staff member removes is
 * actually gone. Beneficiary and submission data especially must survive a
 * mis-click — see §3 of the technical spec.
 */
export const secureFields = {
	isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
	createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
	updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
	createdAt: timestampMs('created_at').default(nowMs).notNull(),
	updatedAt: timestampMs('updated_at').default(nowMs).notNull(),
	deletedAt: timestampMs('deleted_at'),
	deletedBy: text('deleted_by').references(() => user.id, { onDelete: 'set null' })
};

/**
 * The lighter envelope for tables the public writes to (submissions,
 * donations, newsletter signups). `createdBy` has no user to point at when an
 * anonymous visitor fills in a form, so those tables keep the timestamps and
 * the soft delete but drop the authorship columns.
 */
export const publicFields = {
	createdAt: timestampMs('created_at').default(nowMs).notNull(),
	updatedAt: timestampMs('updated_at').default(nowMs).notNull(),
	deletedAt: timestampMs('deleted_at')
};

/* ==========================================================================
   Better Auth core tables
   ========================================================================== */

export const user = sqliteTable(
	'user',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull().unique(),
		emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
		image: text('image'),
		/** Better Auth's own string role field; the real model is `roleId` below. */
		role: text('role'),
		banned: integer('banned', { mode: 'boolean' }),
		banReason: text('ban_reason'),
		banExpires: timestampMs('ban_expires'),
		roleId: integer('role_id').references(() => roles.id, { onDelete: 'set null' }),
		/** Reserved. v1 is English-only; see the note at the top of `schema.ts`. */
		preferredLanguage: text('preferred_language', { enum: ['en', 'am'] })
			.default('en')
			.notNull(),
		phone: text('phone'),
		createdAt: timestampMs('created_at').default(nowMs).notNull(),
		updatedAt: timestampMs('updated_at').default(nowMs).notNull()
	},
	(table) => [index('user_role_id_idx').on(table.roleId)]
);

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: timestampMs('expires_at').notNull(),
		token: text('token').notNull().unique(),
		createdAt: timestampMs('created_at').default(nowMs).notNull(),
		updatedAt: timestampMs('updated_at').default(nowMs).notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		impersonatedBy: text('impersonated_by')
	},
	(table) => [index('session_user_id_idx').on(table.userId)]
);

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestampMs('access_token_expires_at'),
		refreshTokenExpiresAt: timestampMs('refresh_token_expires_at'),
		scope: text('scope'),
		password: text('password'),
		createdAt: timestampMs('created_at').default(nowMs).notNull(),
		updatedAt: timestampMs('updated_at').default(nowMs).notNull()
	},
	(table) => [index('account_user_id_idx').on(table.userId)]
);

export const verification = sqliteTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestampMs('expires_at').notNull(),
		createdAt: timestampMs('created_at').default(nowMs).notNull(),
		updatedAt: timestampMs('updated_at').default(nowMs).notNull()
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
);

/* ==========================================================================
   Roles & permissions
   ========================================================================== */

/**
 * Who *can* be a `program_staff` is dashboard-editable. What a `program_staff`
 * *can do* is not — see §7 of the spec. `slug` is the code-level handle that
 * permission checks key off; `name` is the editable label.
 */
export const roles = sqliteTable('roles', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull().unique(),
	description: text('description'),
	isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull()
});

export const permissions = sqliteTable('permissions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	/** Namespaced verb, e.g. `submissions.read`, `donations.reconcile`. */
	name: text('name').notNull().unique(),
	description: text('description'),
	/** Grouping for the permission-picker UI, e.g. `Applications`, `Finance`. */
	group: text('group').default('General').notNull()
});

export const rolePermissions = sqliteTable(
	'role_permissions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		roleId: integer('role_id')
			.notNull()
			.references(() => roles.id, { onDelete: 'cascade' }),
		permissionId: integer('permission_id')
			.notNull()
			.references(() => permissions.id, { onDelete: 'cascade' }),
		...secureFields
	},
	(table) => [
		uniqueIndex('role_permissions_unique').on(table.roleId, table.permissionId),
		index('role_permissions_role_idx').on(table.roleId)
	]
);

/** A permission granted to one person on top of whatever their role carries. */
export const specialPermissions = sqliteTable(
	'special_permissions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		permissionId: integer('permission_id')
			.notNull()
			.references(() => permissions.id, { onDelete: 'cascade' }),
		...secureFields
	},
	(table) => [
		uniqueIndex('special_permissions_unique').on(table.userId, table.permissionId),
		index('special_permissions_user_idx').on(table.userId)
	]
);

/* ==========================================================================
   Relations
   ========================================================================== */

export const rolesRelations = relations(roles, ({ many }) => ({
	rolePermissions: many(rolePermissions),
	users: many(user)
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
	rolePermissions: many(rolePermissions),
	specialPermissions: many(specialPermissions)
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
	role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
	permission: one(permissions, {
		fields: [rolePermissions.permissionId],
		references: [permissions.id]
	})
}));

export const specialPermissionsRelations = relations(specialPermissions, ({ one }) => ({
	user: one(user, { fields: [specialPermissions.userId], references: [user.id] }),
	permission: one(permissions, {
		fields: [specialPermissions.permissionId],
		references: [permissions.id]
	})
}));

export const userRelations = relations(user, ({ one, many }) => ({
	role: one(roles, { fields: [user.roleId], references: [roles.id] }),
	sessions: many(session),
	accounts: many(account),
	specialPermissions: many(specialPermissions)
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] })
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, { fields: [account.userId], references: [user.id] })
}));
