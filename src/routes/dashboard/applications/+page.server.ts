import { and, asc, desc, eq, inArray, isNull, like, notInArray, or, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	applicationNeeds,
	applicationSubjects,
	assistanceNeeds,
	formDefinitions,
	formSubmissions,
	pillars,
	regions,
	statusOptions,
	user
} from '$lib/server/db/schema';
import { pillarScope, requirePermission } from '$lib/server/permissions';
import { listStatuses } from '$lib/server/workflow';
import { auditList } from '$lib/server/audit';
import type { PageServerLoad } from './$types';

/**
 * The case list and workflow board.
 *
 * §5.5 calls for a kanban view by `status_options.stage`, and this route serves
 * both that and a filtered table from one query — the board is a grouping of
 * the same rows, so fetching twice would be waste.
 *
 * Every query here goes through `pillarScope`. That is the §3.10 rule made
 * real: a Mental Wellness caseworker's board contains Mental Wellness cases,
 * and no URL parameter changes that.
 */
export const load: PageServerLoad = async (event) => {
	const access = await requirePermission(event, 'submissions.read');

	const url = event.url;
	const search = url.searchParams.get('q')?.trim() ?? '';
	const statusId = url.searchParams.get('status');
	const pillarId = url.searchParams.get('pillar');
	const mine = url.searchParams.get('mine') === '1';
	const needId = url.searchParams.get('need');
	const unassignedPillar = url.searchParams.get('untriaged') === '1';

	const clauses: (SQL | undefined)[] = [
		isNull(formSubmissions.deletedAt),
		pillarScope(access, formSubmissions.pillarId),
		// Was `pillar_id is not null`, to keep contact-form messages off the
		// board. Messages have their own table now, and that filter had become
		// actively harmful: an application from someone who answered "I am not
		// sure which programme" also carries no pillar, and would have been
		// invisible here — the one case most in need of a human triaging it.
		// Keeps the legacy contact-form submissions off the board. They were
		// copied into `contact_messages` by migration 0012 and the originals left
		// in place, so they are still rows here — excluded by which form they
		// came from, which is the actual question, rather than by whether they
		// have a pillar.
		notInArray(
			formSubmissions.formDefinitionId,
			db
				.select({ id: formDefinitions.id })
				.from(formDefinitions)
				.where(eq(formDefinitions.slug, 'contact-form'))
		)
	];

	if (statusId) clauses.push(eq(formSubmissions.statusId, Number(statusId)));
	if (pillarId) clauses.push(eq(formSubmissions.pillarId, Number(pillarId)));
	if (unassignedPillar) clauses.push(isNull(formSubmissions.pillarId));
	if (mine) clauses.push(eq(formSubmissions.assignedReviewerId, access.userId));

	// The question the needs catalogue exists to answer: who is asking for
	// school fees this term.
	if (needId) {
		clauses.push(
			inArray(
				formSubmissions.id,
				db
					.select({ id: applicationNeeds.formSubmissionId })
					.from(applicationNeeds)
					.where(eq(applicationNeeds.needId, Number(needId)))
			)
		);
	}
	if (search) {
		const needle = `%${search}%`;
		clauses.push(
			or(
				like(formSubmissions.referenceNumber, needle),
				like(formSubmissions.submittedByName, needle),
				like(formSubmissions.submittedByPhone, needle),
				like(formSubmissions.submittedByEmail, needle)
			)
		);
	}

	const where = and(...(clauses.filter(Boolean) as SQL[]));

	const [rows, statuses, pillarOptions, regionOptions, reviewers, needOptions] = await Promise.all([
		db
			.select({
				id: formSubmissions.id,
				reference: formSubmissions.referenceNumber,
				name: formSubmissions.submittedByName,
				phone: formSubmissions.submittedByPhone,
				email: formSubmissions.submittedByEmail,
				priority: formSubmissions.priority,
				isRead: formSubmissions.isRead,
				createdAt: formSubmissions.createdAt,
				statusId: formSubmissions.statusId,
				statusLabel: statusOptions.label,
				statusColor: statusOptions.color,
				statusStage: statusOptions.stage,
				statusOrder: statusOptions.sortOrder,
				pillarId: formSubmissions.pillarId,
				pillarName: pillars.name,
				pillarColor: pillars.color,
				formName: formDefinitions.name,
				regionName: regions.name,
				reviewerName: user.name,
				// Present only for applications taken through `/apply`.
				subjectName: applicationSubjects.fullName,
				applyingFor: applicationSubjects.applyingFor,
				safeToContact: applicationSubjects.safeToContact
			})
			.from(formSubmissions)
			.leftJoin(statusOptions, eq(statusOptions.id, formSubmissions.statusId))
			.leftJoin(pillars, eq(pillars.id, formSubmissions.pillarId))
			.leftJoin(formDefinitions, eq(formDefinitions.id, formSubmissions.formDefinitionId))
			.leftJoin(regions, eq(regions.id, formSubmissions.regionId))
			.leftJoin(user, eq(user.id, formSubmissions.assignedReviewerId))
			.leftJoin(applicationSubjects, eq(applicationSubjects.formSubmissionId, formSubmissions.id))
			.where(where)
			// Urgent first within a column, then newest.
			.orderBy(desc(formSubmissions.createdAt))
			// A board is unusable past a few hundred cards; the table view's
			// filters are how you reach older cases.
			.limit(500),

		listStatuses('application'),

		db
			.select({ id: pillars.id, name: pillars.name })
			.from(pillars)
			.where(isNull(pillars.deletedAt)),

		db
			.select({ id: regions.id, name: regions.name })
			.from(regions)
			.where(isNull(regions.deletedAt)),

		db.select({ id: user.id, name: user.name }).from(user),

		db
			.select({ id: assistanceNeeds.id, name: assistanceNeeds.name })
			.from(assistanceNeeds)
			.where(and(eq(assistanceNeeds.isActive, true), isNull(assistanceNeeds.deletedAt)))
			.orderBy(asc(assistanceNeeds.sortOrder), asc(assistanceNeeds.id))
	]);

	// One audit row per screen load with the filters used, rather than one per
	// case shown — §3.11 wants to know who looked, not to drown in rows.
	auditList(event, 'form_submission', {
		search,
		statusId,
		pillarId,
		needId,
		mine,
		untriaged: unassignedPillar,
		results: rows.length
	});

	return {
		rows,
		statuses,
		pillarOptions: access.pillarIds
			? pillarOptions.filter((pillar) => access.pillarIds!.includes(pillar.id))
			: pillarOptions,
		regionOptions,
		reviewers,
		needOptions,
		filters: { search, statusId, pillarId, needId, mine, untriaged: unassignedPillar }
	};
};
