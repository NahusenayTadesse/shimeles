import { and, eq, isNull } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { pillars, regions, volunteerApplications } from '$lib/server/db/schema';
import { nextVolunteerReference } from '$lib/server/reference';
import { defaultStatus, recomputeSafeguarding } from '$lib/server/workflow';
import { audit } from '$lib/server/audit';
import type { RenderForm } from '$lib/forms/types';
import type { SubmitResult } from '$lib/server/submissions';

/**
 * Turning a volunteer-form submission into a volunteer application.
 *
 * §3.6 breaks volunteers out of `form_submissions` on purpose: the safeguarding
 * and credential workflow deserves first-class, queryable columns rather than
 * everything jammed into a JSON blob. "Has this volunteer's licence been
 * verified?" has to be a `where` clause, not a JSON path.
 *
 * The *questions* still come from the `volunteer-application` form definition,
 * so a coordinator can add one from the form builder. This function lifts the
 * few answers the workflow depends on into their own columns and keeps the rest
 * in `data`.
 */

/** Answers the workflow needs as columns. Everything else stays in `data`. */
const PROMOTED = new Set([
	'full_name',
	'phone',
	'email',
	'areas_of_interest',
	'skills',
	'availability',
	'professional_credentials',
	'is_professional',
	'region'
]);

export async function submitVolunteerApplication(
	event: RequestEvent,
	form: RenderForm,
	payload: Record<string, unknown>
): Promise<SubmitResult> {
	const str = (key: string): string | null => {
		const value = payload[key];
		if (typeof value !== 'string') return null;
		return value.trim() || null;
	};

	const list = (key: string): string[] => {
		const value = payload[key];
		if (Array.isArray(value)) return value.map(String);
		if (typeof value === 'string' && value) return value.split(',').map((item) => item.trim());
		return [];
	};

	// Interests come back as pillar slugs from the form's option list; storing
	// ids keeps them stable if a pillar is later renamed.
	const interestSlugs = list('areas_of_interest');
	const pillarRows = interestSlugs.length
		? await db
				.select({ id: pillars.id, slug: pillars.slug })
				.from(pillars)
				.where(isNull(pillars.deletedAt))
		: [];
	const areasOfInterest = interestSlugs.map(
		(slug) => pillarRows.find((row) => row.slug === slug)?.id ?? slug
	);

	// Anything that is not a promoted column still gets stored — a coordinator
	// who added a question must be able to read its answer.
	const rest: Record<string, unknown> = {};
	for (const field of form.fields) {
		if (field.type === 'heading' || PROMOTED.has(field.key)) continue;
		const value = payload[field.key];
		if (value === undefined || value === '') continue;
		rest[field.key] = value;
	}

	const [defaultRegion] = await db
		.select({ id: regions.id })
		.from(regions)
		.where(and(eq(regions.isDefault, true), isNull(regions.deletedAt)))
		.limit(1);

	const status = await defaultStatus('volunteer');
	const referenceNumber = nextVolunteerReference();

	// Only stored when the applicant said they are a professional. A volunteer
	// who ticked "no" but typed something in a conditional field must not end up
	// gated behind credential verification they never claimed.
	const isProfessional = str('is_professional') === 'yes';

	const [application] = await db
		.insert(volunteerApplications)
		.values({
			referenceNumber,
			fullName: str('full_name') ?? str('submittedByName') ?? 'Unnamed applicant',
			email: str('email') ?? str('submittedByEmail'),
			phone: str('phone') ?? str('submittedByPhone'),
			regionId: defaultRegion?.id ?? null,
			areasOfInterest,
			skills: str('skills') ? [str('skills')!] : [],
			availability: str('availability'),
			professionalCredentials: isProfessional ? str('professional_credentials') : null,
			data: rest,
			statusId: status?.id ?? null,
			createdAt: new Date(),
			updatedAt: new Date()
		})
		.returning({ id: volunteerApplications.id });

	// Sets `safeguarding_checklist_complete` correctly from the start — false
	// for everyone, and false against the professional-only items too when the
	// applicant claims credentials.
	await recomputeSafeguarding(application.id);

	audit({
		event,
		action: 'created',
		entityType: 'volunteer_application',
		entityId: application.id,
		metadata: { reference: referenceNumber, isProfessional }
	});

	return { id: application.id, referenceNumber };
}
