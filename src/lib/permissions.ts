/**
 * Role and permission constants.
 *
 * Kept out of `$lib/server` on purpose: the seed script imports these without a
 * running SvelteKit server, and the dashboard sidebar imports them to decide
 * which links to draw. Neither should have to pull in a database connection to
 * know that `finance` can reconcile donations.
 */

/* ==========================================================================
   Roles
   ========================================================================== */

/**
 * Role slugs are code-level handles, not labels. Renaming "Program Staff" to
 * "Case Worker" in the dashboard changes `roles.name`; these slugs and the
 * permission sets attached to them are developer territory (§7).
 */
export const ROLE = {
	SUPER_ADMIN: 'super_admin',
	PROGRAM_STAFF: 'program_staff',
	FINANCE: 'finance',
	VOLUNTEER_COORDINATOR: 'volunteer_coordinator'
} as const;

export type RoleSlug = (typeof ROLE)[keyof typeof ROLE];

/**
 * Every permission the system checks, with the roles that hold it by default.
 * This is the seed source as well as the reference list — `bun run db:seed`
 * reads it, so adding a permission here and re-seeding is the whole workflow.
 */
export const PERMISSIONS = {
	// Content & configuration
	'content.manage': {
		group: 'Content',
		description: 'Edit pages, blocks, navigation, translations'
	},
	'settings.manage': { group: 'Content', description: 'Edit site settings' },
	'pillars.manage': { group: 'Content', description: 'Edit pillars and future initiatives' },
	'forms.manage': { group: 'Content', description: 'Build and edit public forms' },

	// Case work
	'submissions.read': { group: 'Applications', description: 'View assistance applications' },
	'submissions.write': { group: 'Applications', description: 'Edit applications, notes, status' },
	'submissions.assign': { group: 'Applications', description: 'Assign a reviewer' },
	'beneficiaries.read': { group: 'Applications', description: 'View beneficiaries and households' },
	'beneficiaries.write': {
		group: 'Applications',
		description: 'Edit beneficiaries and households'
	},

	// Money
	'donations.read': { group: 'Finance', description: 'View donors, donations and pledges' },
	'donations.write': { group: 'Finance', description: 'Edit donations and pledges' },
	'donations.reconcile': { group: 'Finance', description: 'Match bank transfers to donations' },
	'disbursements.read': { group: 'Finance', description: 'View disbursements' },
	'disbursements.write': { group: 'Finance', description: 'Record disbursements' },

	// Volunteers
	'volunteers.read': { group: 'Volunteers', description: 'View volunteer applications' },
	'volunteers.write': { group: 'Volunteers', description: 'Edit volunteer applications' },
	'volunteers.safeguarding': {
		group: 'Volunteers',
		description: 'Complete safeguarding checks and approve volunteers'
	},

	// Administration
	'users.manage': { group: 'Administration', description: 'Manage users, roles and permissions' },
	'audit.read': { group: 'Administration', description: 'Read the audit log' },
	'data.export': { group: 'Administration', description: 'Export table data' }
} as const;

export type Permission = keyof typeof PERMISSIONS;

/** The default grant per role. `super_admin` is handled as a wildcard below. */
export const ROLE_PERMISSIONS: Record<Exclude<RoleSlug, 'super_admin'>, Permission[]> = {
	program_staff: [
		'submissions.read',
		'submissions.write',
		'submissions.assign',
		'beneficiaries.read',
		'beneficiaries.write',
		'disbursements.read',
		'disbursements.write'
	],
	finance: [
		'donations.read',
		'donations.write',
		'donations.reconcile',
		'disbursements.read',
		'data.export'
	],
	volunteer_coordinator: ['volunteers.read', 'volunteers.write', 'volunteers.safeguarding']
};
