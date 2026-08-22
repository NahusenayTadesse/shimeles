import { json } from '@sveltejs/kit';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	beneficiaries,
	contactMessages,
	donors,
	formSubmissions,
	volunteerApplications
} from '$lib/server/db/schema';
import { searchFilter } from '$lib/server/query';
import { pillarScope, requireUser } from '$lib/server/permissions';
import { audit } from '$lib/server/audit';
import type { RequestHandler } from './$types';

/**
 * Finding a record, rather than a page.
 *
 * The header palette was a route jumper: it flattened the navigation tree and
 * filtered it by permission, and that was all. But a magnifying glass in a
 * header promises to find things, so staff typed reference numbers and
 * people's names into it, got nothing, and concluded the system could not find
 * their case — the commonest question in this office being someone on the
 * phone quoting "SAF-MED-2026-0142".
 *
 * Everything the list screens enforce is enforced here too, because a search
 * result is a read:
 *
 * - each entity is searched only if the user holds its read permission;
 * - applications are pillar-scoped, so a Mental Wellness caseworker's search
 *   never surfaces an Education case — even as a name in a dropdown;
 * - soft-deleted rows stay hidden;
 * - and the search itself is audited, like every other case read (§3.11).
 *
 * Results carry a reference and a name and nothing else. A palette row is not
 * the place to leak a diagnosis.
 */

/** Enough to be useful, few enough that the palette stays readable. */
const PER_ENTITY = 5;

export const GET: RequestHandler = async (event) => {
	const access = await requireUser(event);
	const term = event.url.searchParams.get('q')?.trim() ?? '';

	// Two characters matches half the database and tells nobody anything.
	if (term.length < 3) return json({ results: [] });

	const can = (permission: Parameters<typeof access.permissions.has>[0]) =>
		access.permissions.has(permission);

	const scope = pillarScope(access, formSubmissions.pillarId);

	const [applications, people, volunteers, givers, messages] = await Promise.all([
		can('submissions.read')
			? db
					.select({
						id: formSubmissions.id,
						reference: formSubmissions.referenceNumber,
						name: formSubmissions.submittedByName
					})
					.from(formSubmissions)
					.where(
						and(
							isNull(formSubmissions.deletedAt),
							searchFilter(term, [
								formSubmissions.referenceNumber,
								formSubmissions.submittedByName,
								formSubmissions.submittedByPhone,
								formSubmissions.submittedByEmail
							]),
							...(scope ? [scope] : [])
						)
					)
					.orderBy(desc(formSubmissions.createdAt))
					.limit(PER_ENTITY)
			: [],

		can('beneficiaries.read')
			? db
					.select({ id: beneficiaries.id, name: beneficiaries.fullName })
					.from(beneficiaries)
					.where(
						and(
							isNull(beneficiaries.deletedAt),
							searchFilter(term, [beneficiaries.fullName, beneficiaries.phone, beneficiaries.email])
						)
					)
					.limit(PER_ENTITY)
			: [],

		can('volunteers.read')
			? db
					.select({
						id: volunteerApplications.id,
						reference: volunteerApplications.referenceNumber,
						name: volunteerApplications.fullName
					})
					.from(volunteerApplications)
					.where(
						and(
							isNull(volunteerApplications.deletedAt),
							searchFilter(term, [
								volunteerApplications.referenceNumber,
								volunteerApplications.fullName,
								volunteerApplications.email,
								volunteerApplications.phone
							])
						)
					)
					.limit(PER_ENTITY)
			: [],

		can('donations.read')
			? db
					.select({
						id: donors.id,
						name: donors.fullName,
						organisation: donors.organisationName
					})
					.from(donors)
					.where(
						and(
							isNull(donors.deletedAt),
							searchFilter(term, [
								donors.fullName,
								donors.organisationName,
								donors.email,
								donors.phone
							])
						)
					)
					.limit(PER_ENTITY)
			: [],

		can('submissions.read')
			? db
					.select({
						id: contactMessages.id,
						reference: contactMessages.referenceNumber,
						name: contactMessages.fullName
					})
					.from(contactMessages)
					.where(
						and(
							isNull(contactMessages.deletedAt),
							eq(contactMessages.isSpam, false),
							searchFilter(term, [
								contactMessages.referenceNumber,
								contactMessages.fullName,
								contactMessages.email,
								contactMessages.phone
							])
						)
					)
					.orderBy(desc(contactMessages.createdAt))
					.limit(PER_ENTITY)
			: []
	]);

	const results = [
		...applications.map((row) => ({
			group: 'Applications',
			label: row.name ?? 'Unnamed applicant',
			hint: row.reference,
			href: `/dashboard/applications/${row.id}`
		})),
		...people.map((row) => ({
			group: 'Beneficiaries',
			label: row.name,
			hint: '',
			href: `/dashboard/beneficiaries/${row.id}`
		})),
		...volunteers.map((row) => ({
			group: 'Volunteers',
			label: row.name,
			hint: row.reference,
			href: `/dashboard/volunteers/${row.id}`
		})),
		...givers.map((row) => ({
			group: 'Donors',
			label: row.organisation ?? row.name,
			hint: row.organisation ? row.name : '',
			href: `/dashboard/donors?q=${encodeURIComponent(row.name)}`
		})),
		...messages.map((row) => ({
			group: 'Messages',
			label: row.name,
			hint: row.reference,
			href: `/dashboard/messages/${row.id}`
		}))
	];

	/*
	 * Audited as a list read rather than per record: the searcher has seen a
	 * name and a reference, not a case. Opening one of these lands on a screen
	 * that writes its own `viewed` row.
	 */
	if (results.length) {
		audit({
			event,
			action: 'viewed_list',
			entityType: 'search',
			metadata: { term, results: results.length }
		});
	}

	return json({ results });
};
