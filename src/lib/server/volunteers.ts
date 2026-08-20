import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	pillars,
	regions,
	volunteerApplications,
	volunteerApplicationSkills,
	volunteerAvailability,
	volunteerCredentials,
	volunteerInterests,
	volunteerProfessions,
	volunteerReferences,
	volunteerSkillCategories,
	volunteerSkills,
	volunteerTimeSlots
} from '$lib/server/db/schema';
import { nextVolunteerReference } from '$lib/server/reference';
import { defaultStatus, recomputeSafeguarding } from '$lib/server/workflow';
import { audit } from '$lib/server/audit';
import { cached } from '$lib/server/cache';
import type { RenderForm } from '$lib/forms/types';
import type { SubmitResult } from '$lib/server/submissions';

/**
 * Volunteer applications — the catalogues the public form is built from, and
 * the write that turns a submission into rows.
 *
 * §3.6 breaks volunteers out of `form_submissions` on purpose: the safeguarding
 * and credential workflow deserves first-class, queryable columns rather than
 * everything jammed into a JSON blob. "Which volunteers can drive, are free on
 * Saturday morning, and have a verified nursing licence?" has to be a `where`
 * clause, not three JSON paths and a regex.
 *
 * The volunteer form is therefore **not** a `form_definitions` row. It is a
 * core workflow with a fixed shape, and a coordinator who deleted the
 * `professional_credentials` field from the form builder would silently break
 * the approval gate. What stays editable is the *vocabulary* — the skills, the
 * time slots, the professions — which are rows in the catalogue tables below
 * and are managed from Configuration in the dashboard (§0). Adding "sign
 * language interpretation" to the form is a row, not a deploy.
 */

/* ==========================================================================
   Catalogues
   ========================================================================== */

export type SkillOption = {
	id: number;
	slug: string;
	name: string;
	hint: string | null;
	requiresCredential: boolean;
	categoryId: number | null;
};

export type SkillGroup = {
	id: number | null;
	name: string;
	description: string | null;
	icon: string | null;
	skills: SkillOption[];
};

export type TimeSlotOption = {
	id: number;
	slug: string;
	label: string;
	dayOfWeek: number | null;
	startTime: string | null;
	endTime: string | null;
	description: string | null;
};

export type ProfessionOption = {
	id: number;
	slug: string;
	name: string;
	category: 'medical' | 'mental_health' | 'allied_health' | 'public_health' | 'other';
	requiresLicense: boolean;
	defaultLicensingBody: string | null;
};

/**
 * Skills, grouped for rendering. Anything whose category has been deleted
 * falls into a trailing "Other" group rather than vanishing from the form —
 * a skill nobody can claim because its category was tidied away is worse than
 * an ugly heading.
 */
export async function getVolunteerSkills(): Promise<SkillGroup[]> {
	return cached('volunteer:skills', async () => {
		const [categories, skills] = await Promise.all([
			db
				.select()
				.from(volunteerSkillCategories)
				.where(
					and(
						eq(volunteerSkillCategories.isActive, true),
						isNull(volunteerSkillCategories.deletedAt)
					)
				)
				.orderBy(asc(volunteerSkillCategories.sortOrder), asc(volunteerSkillCategories.id)),
			db
				.select()
				.from(volunteerSkills)
				.where(and(eq(volunteerSkills.isActive, true), isNull(volunteerSkills.deletedAt)))
				.orderBy(asc(volunteerSkills.sortOrder), asc(volunteerSkills.id))
		]);

		const toOption = (row: (typeof skills)[number]): SkillOption => ({
			id: row.id,
			slug: row.slug,
			name: row.name,
			hint: row.hint,
			requiresCredential: row.requiresCredential,
			categoryId: row.categoryId
		});

		const groups: SkillGroup[] = categories.map((category) => ({
			id: category.id,
			name: category.name,
			description: category.description,
			icon: category.icon,
			skills: skills.filter((skill) => skill.categoryId === category.id).map(toOption)
		}));

		const known = new Set(categories.map((category) => category.id));
		const orphans = skills.filter((skill) => !skill.categoryId || !known.has(skill.categoryId));
		if (orphans.length) {
			groups.push({
				id: null,
				name: 'Other skills',
				description: null,
				icon: null,
				skills: orphans.map(toOption)
			});
		}

		return groups.filter((group) => group.skills.length > 0);
	});
}

export async function getVolunteerTimeSlots(): Promise<TimeSlotOption[]> {
	return cached('volunteer:timeslots', async () =>
		db
			.select({
				id: volunteerTimeSlots.id,
				slug: volunteerTimeSlots.slug,
				label: volunteerTimeSlots.label,
				dayOfWeek: volunteerTimeSlots.dayOfWeek,
				startTime: volunteerTimeSlots.startTime,
				endTime: volunteerTimeSlots.endTime,
				description: volunteerTimeSlots.description
			})
			.from(volunteerTimeSlots)
			.where(and(eq(volunteerTimeSlots.isActive, true), isNull(volunteerTimeSlots.deletedAt)))
			.orderBy(asc(volunteerTimeSlots.sortOrder), asc(volunteerTimeSlots.id))
	);
}

export async function getVolunteerProfessions(): Promise<ProfessionOption[]> {
	return cached('volunteer:professions', async () =>
		db
			.select({
				id: volunteerProfessions.id,
				slug: volunteerProfessions.slug,
				name: volunteerProfessions.name,
				category: volunteerProfessions.category,
				requiresLicense: volunteerProfessions.requiresLicense,
				defaultLicensingBody: volunteerProfessions.defaultLicensingBody
			})
			.from(volunteerProfessions)
			.where(and(eq(volunteerProfessions.isActive, true), isNull(volunteerProfessions.deletedAt)))
			.orderBy(asc(volunteerProfessions.sortOrder), asc(volunteerProfessions.id))
	);
}

/** Everything `/volunteer` needs to render its form, in one call. */
export async function getVolunteerCatalog() {
	const [skills, timeSlots, professions, pillarRows, regionRows] = await Promise.all([
		getVolunteerSkills(),
		getVolunteerTimeSlots(),
		getVolunteerProfessions(),
		db
			.select({ id: pillars.id, slug: pillars.slug, name: pillars.name, summary: pillars.summary })
			.from(pillars)
			.where(and(eq(pillars.isActive, true), isNull(pillars.deletedAt)))
			.orderBy(asc(pillars.sortOrder), asc(pillars.id)),
		db
			.select({ id: regions.id, name: regions.name, isDefault: regions.isDefault })
			.from(regions)
			.where(and(eq(regions.isActive, true), isNull(regions.deletedAt)))
			.orderBy(asc(regions.sortOrder), asc(regions.id))
	]);

	return { skills, timeSlots, professions, pillars: pillarRows, regions: regionRows };
}

/* ==========================================================================
   Derived columns
   ========================================================================== */

/**
 * Rebuilds `is_professional`, `professional_credentials` and
 * `credentials_verified` from the credential rows.
 *
 * These three columns are a cache of `volunteer_credentials`, and this is the
 * only function allowed to write them. That matters because the approval gate
 * in `setVolunteerStatus` reads them: if a coordinator could tick
 * `credentialsVerified` by hand while an unverified licence row sat underneath,
 * the gate would be checking a lie.
 *
 * `credentials_verified` is deliberately all-or-nothing. A volunteer who
 * claims to be both a nurse and a counsellor, with only the nursing licence
 * checked, is not verified — they would otherwise be placeable on the strength
 * of a credential nobody looked at.
 */
export async function recomputeCredentials(applicationId: number): Promise<void> {
	const rows = await db
		.select({
			status: volunteerCredentials.verificationStatus,
			licenseNumber: volunteerCredentials.licenseNumber,
			licensingBody: volunteerCredentials.licensingBody,
			otherProfession: volunteerCredentials.otherProfession,
			professionName: volunteerProfessions.name
		})
		.from(volunteerCredentials)
		.leftJoin(volunteerProfessions, eq(volunteerProfessions.id, volunteerCredentials.professionId))
		.where(
			and(
				eq(volunteerCredentials.volunteerApplicationId, applicationId),
				isNull(volunteerCredentials.deletedAt)
			)
		);

	if (!rows.length) {
		await db
			.update(volunteerApplications)
			.set({
				isProfessional: false,
				professionalCredentials: null,
				// Null, not false: "no credentials claimed" is not "credentials
				// checked and found wanting", and `canApproveVolunteer` only gates
				// on a non-empty `professionalCredentials`.
				credentialsVerified: null,
				updatedAt: new Date()
			})
			.where(eq(volunteerApplications.id, applicationId));
		return;
	}

	const summary = rows
		.map((row) => {
			const name = row.professionName ?? row.otherProfession ?? 'Professional';
			const parts = [name];
			if (row.licenseNumber) parts.push(`licence ${row.licenseNumber}`);
			if (row.licensingBody) parts.push(row.licensingBody);
			return `${parts.join(' — ')} (${row.status})`;
		})
		.join('\n');

	await db
		.update(volunteerApplications)
		.set({
			isProfessional: true,
			professionalCredentials: summary,
			credentialsVerified: rows.every((row) => row.status === 'verified'),
			updatedAt: new Date()
		})
		.where(eq(volunteerApplications.id, applicationId));
}

/**
 * Rebuilds `references_checked` from the reference rows: true once every
 * reference has an outcome recorded and none of them came back unsatisfactory.
 * An application with no references on file is not "checked".
 */
export async function recomputeReferences(applicationId: number): Promise<boolean> {
	const rows = await db
		.select({ status: volunteerReferences.status })
		.from(volunteerReferences)
		.where(
			and(
				eq(volunteerReferences.volunteerApplicationId, applicationId),
				isNull(volunteerReferences.deletedAt)
			)
		);

	const checked = rows.length > 0 && rows.every((row) => row.status === 'satisfactory');

	await db
		.update(volunteerApplications)
		.set({ referencesChecked: checked, updatedAt: new Date() })
		.where(eq(volunteerApplications.id, applicationId));

	return checked;
}

/* ==========================================================================
   The public submission
   ========================================================================== */

export type VolunteerSubmission = {
	fullName: string;
	email: string | null;
	phone: string | null;
	city: string | null;
	regionId: number | null;
	dateOfBirth: string | null;
	gender: 'female' | 'male' | 'other' | 'prefer_not_to_say' | null;
	occupation: string | null;
	emergencyContactName: string | null;
	emergencyContactPhone: string | null;
	emergencyContactRelationship: string | null;
	pillarIds: number[];
	skills: {
		skillId: number;
		proficiency: 'basic' | 'intermediate' | 'advanced' | 'professional';
	}[];
	otherSkills: string[];
	timeSlotIds: number[];
	availabilityNote: string | null;
	hoursPerWeek: number | null;
	commitmentMonths: number | null;
	availableFrom: string | null;
	motivation: string | null;
	heardAbout: string | null;
	credentials: {
		professionId: number | null;
		otherProfession: string | null;
		licenseNumber: string | null;
		licensingBody: string | null;
		specialization: string | null;
		yearsExperience: number | null;
		issuedOn: string | null;
		expiresOn: string | null;
	}[];
	references: {
		fullName: string;
		relationship: string | null;
		organization: string | null;
		email: string | null;
		phone: string | null;
	}[];
	hasPriorConviction: boolean | null;
	priorConvictionDetail: string | null;
	consentBackgroundCheck: boolean;
	agreeCodeOfConduct: boolean;
};

/**
 * Writes one volunteer application and everything hanging off it.
 *
 * Every id that arrives from the browser is re-read against the active
 * catalogue before it is stored. A posted `skillId` for a deleted skill, or a
 * `pillarId` that is not a pillar, is dropped rather than written — the form
 * only ever offers live rows, so anything else is either a stale tab or
 * someone poking at the endpoint, and neither should be able to create a
 * dangling reference.
 *
 * The whole write is one transaction: a volunteer whose application row exists
 * but whose safeguarding-relevant credential rows failed to insert would sit in
 * the queue looking like a general volunteer.
 */
export async function createVolunteerApplication(
	event: RequestEvent,
	input: VolunteerSubmission
): Promise<SubmitResult> {
	const [validSkills, validSlots, validPillars, validProfessions, status, defaultRegion] =
		await Promise.all([
			input.skills.length
				? db
						.select({
							id: volunteerSkills.id,
							requiresCredential: volunteerSkills.requiresCredential
						})
						.from(volunteerSkills)
						.where(
							and(
								inArray(
									volunteerSkills.id,
									input.skills.map((skill) => skill.skillId)
								),
								eq(volunteerSkills.isActive, true),
								isNull(volunteerSkills.deletedAt)
							)
						)
				: [],
			input.timeSlotIds.length
				? db
						.select({ id: volunteerTimeSlots.id })
						.from(volunteerTimeSlots)
						.where(
							and(
								inArray(volunteerTimeSlots.id, input.timeSlotIds),
								eq(volunteerTimeSlots.isActive, true),
								isNull(volunteerTimeSlots.deletedAt)
							)
						)
				: [],
			input.pillarIds.length
				? db
						.select({ id: pillars.id })
						.from(pillars)
						.where(
							and(
								inArray(pillars.id, input.pillarIds),
								eq(pillars.isActive, true),
								isNull(pillars.deletedAt)
							)
						)
				: [],
			db
				.select({ id: volunteerProfessions.id })
				.from(volunteerProfessions)
				.where(
					and(eq(volunteerProfessions.isActive, true), isNull(volunteerProfessions.deletedAt))
				),
			defaultStatus('volunteer'),
			db
				.select({ id: regions.id })
				.from(regions)
				.where(and(eq(regions.isDefault, true), isNull(regions.deletedAt)))
				.limit(1)
		]);

	const skillIds = new Set(validSkills.map((row) => row.id));
	const slotIds = new Set(validSlots.map((row) => row.id));
	const pillarIds = new Set(validPillars.map((row) => row.id));
	const professionIds = new Set(validProfessions.map((row) => row.id));

	// A credential whose profession is neither a live catalogue row nor a
	// written-in name carries no information, so it is not stored.
	const credentials = input.credentials
		.map((credential) => ({
			...credential,
			professionId:
				credential.professionId && professionIds.has(credential.professionId)
					? credential.professionId
					: null
		}))
		.filter((credential) => credential.professionId || credential.otherProfession?.trim());

	const referenceNumber = nextVolunteerReference();
	const now = new Date();

	const applicationId = db.transaction((tx) => {
		const [application] = tx
			.insert(volunteerApplications)
			.values({
				referenceNumber,
				fullName: input.fullName,
				email: input.email,
				phone: input.phone,
				city: input.city,
				regionId: input.regionId ?? defaultRegion[0]?.id ?? null,
				dateOfBirth: input.dateOfBirth,
				gender: input.gender,
				occupation: input.occupation,
				emergencyContactName: input.emergencyContactName,
				emergencyContactPhone: input.emergencyContactPhone,
				emergencyContactRelationship: input.emergencyContactRelationship,
				// Written for the legacy readers; `volunteer_interests` is the truth.
				areasOfInterest: [...pillarIds],
				skills: input.otherSkills,
				availability: input.availabilityNote,
				hoursPerWeek: input.hoursPerWeek,
				commitmentMonths: input.commitmentMonths,
				availableFrom: input.availableFrom,
				motivation: input.motivation,
				heardAbout: input.heardAbout,
				hasPriorConviction: input.hasPriorConviction,
				priorConvictionDetail: input.priorConvictionDetail,
				// Stamped from the server clock, not from anything posted.
				backgroundCheckConsentAt: input.consentBackgroundCheck ? now : null,
				codeOfConductAgreedAt: input.agreeCodeOfConduct ? now : null,
				statusId: status?.id ?? null,
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: volunteerApplications.id })
			.all();

		const id = application.id;

		const chosenSkills = input.skills.filter((skill) => skillIds.has(skill.skillId));
		if (chosenSkills.length) {
			tx.insert(volunteerApplicationSkills)
				.values(
					chosenSkills.map((skill) => ({
						volunteerApplicationId: id,
						skillId: skill.skillId,
						proficiency: skill.proficiency
					}))
				)
				.run();
		}

		const chosenSlots = input.timeSlotIds.filter((slotId) => slotIds.has(slotId));
		if (chosenSlots.length) {
			tx.insert(volunteerAvailability)
				.values(chosenSlots.map((timeSlotId) => ({ volunteerApplicationId: id, timeSlotId })))
				.run();
		}

		if (pillarIds.size) {
			tx.insert(volunteerInterests)
				.values([...pillarIds].map((pillarId) => ({ volunteerApplicationId: id, pillarId })))
				.run();
		}

		if (credentials.length) {
			tx.insert(volunteerCredentials)
				.values(
					credentials.map((credential) => ({
						volunteerApplicationId: id,
						professionId: credential.professionId,
						otherProfession: credential.otherProfession,
						licenseNumber: credential.licenseNumber,
						licensingBody: credential.licensingBody,
						specialization: credential.specialization,
						yearsExperience: credential.yearsExperience,
						issuedOn: credential.issuedOn,
						expiresOn: credential.expiresOn
						// `verificationStatus` defaults to `pending`. Nothing the
						// applicant posts can make it anything else.
					}))
				)
				.run();
		}

		if (input.references.length) {
			tx.insert(volunteerReferences)
				.values(
					input.references.map((reference, index) => ({
						volunteerApplicationId: id,
						fullName: reference.fullName,
						relationship: reference.relationship,
						organization: reference.organization,
						email: reference.email,
						phone: reference.phone,
						sortOrder: index
					}))
				)
				.run();
		}

		return id;
	});

	// Both are derived columns, and both are recomputed rather than written
	// inline above so that there is exactly one place each of them is set.
	await recomputeCredentials(applicationId);
	await recomputeSafeguarding(applicationId);

	audit({
		event,
		action: 'created',
		entityType: 'volunteer_application',
		entityId: applicationId,
		metadata: {
			reference: referenceNumber,
			skills: input.skills.length,
			slots: input.timeSlotIds.length,
			credentials: credentials.length
		}
	});

	return { id: applicationId, referenceNumber };
}

/* ==========================================================================
   Legacy: the dynamic-form path
   ========================================================================== */

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

/**
 * Turns a `volunteer-application` form-definition submission into an
 * application row.
 *
 * Superseded by `/volunteer`, which posts structured rows rather than a bag of
 * answers. This is kept because the `form_definitions` row still exists and
 * `/forms/volunteer-application` may have been shared or bookmarked — a link
 * that used to work should not start 404ing. What arrives this way lands in
 * the same table with the catalogue joins empty, which reads on the staff
 * screen as exactly what it is: an application taken the old way.
 */
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
			isProfessional,
			professionalCredentials: isProfessional ? str('professional_credentials') : null,
			data: rest,
			statusId: status?.id ?? null,
			createdAt: new Date(),
			updatedAt: new Date()
		})
		.returning({ id: volunteerApplications.id });

	// The pillar ids that could be resolved also become interest rows, so the
	// staff screen and any "who is interested in youth education" query see
	// applications taken this way too.
	const resolvedPillarIds = areasOfInterest.filter(
		(value): value is number => typeof value === 'number'
	);
	if (resolvedPillarIds.length) {
		await db
			.insert(volunteerInterests)
			.values(
				resolvedPillarIds.map((pillarId) => ({
					volunteerApplicationId: application.id,
					pillarId
				}))
			)
			.onConflictDoNothing();
	}

	// Sets `safeguarding_checklist_complete` correctly from the start — false
	// for everyone, and false against the professional-only items too when the
	// applicant claims credentials.
	await recomputeSafeguarding(application.id);

	audit({
		event,
		action: 'created',
		entityType: 'volunteer_application',
		entityId: application.id,
		metadata: { reference: referenceNumber, isProfessional, legacyForm: true }
	});

	return { id: application.id, referenceNumber };
}
