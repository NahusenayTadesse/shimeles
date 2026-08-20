import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	applicationNeeds,
	applicationSubjects,
	assistanceNeedCategories,
	assistanceNeeds,
	beneficiaries,
	files,
	formDefinitions,
	formSubmissionDocuments,
	formSubmissions,
	languages,
	pillars,
	regions
} from '$lib/server/db/schema';
import { nextSubmissionReference } from '$lib/server/reference';
import { defaultStatus } from '$lib/server/workflow';
import { saveUploadedFile } from '$lib/server/upload';
import { audit } from '$lib/server/audit';
import { cached } from '$lib/server/cache';
import type { SubmitResult } from '$lib/server/submissions';

/**
 * Applying for help.
 *
 * The case itself stays a `form_submissions` row — that is where pillar scope,
 * case notes, documents, disbursements and the audited reads already live, and
 * a fourth parallel case table would fracture all of it. What `/apply` adds is
 * the structure the dynamic form could not hold: who is actually being helped,
 * what they are asking for, and what language they wrote it in.
 *
 * The one rule worth stating plainly: **an application is never turned away for
 * missing information.** §3.3 makes Mental Wellness low-barrier, and almost
 * every field below is optional because someone in the middle of a crisis
 * should not be blocked by a form. Only a name, a way to reach somebody, and
 * some description of the need are required.
 */

/* ==========================================================================
   Catalogues
   ========================================================================== */

export type NeedOption = {
	id: number;
	slug: string;
	name: string;
	description: string | null;
	evidenceHint: string | null;
	pillarId: number | null;
	categoryId: number | null;
};

export type NeedGroup = {
	id: number | null;
	name: string;
	description: string | null;
	icon: string | null;
	needs: NeedOption[];
};

/**
 * Needs, grouped for rendering. A need whose category was deleted still
 * appears, under a trailing "Other" group — something a person can ask for
 * must not vanish because of a tidy-up.
 */
export async function getAssistanceNeeds(): Promise<NeedGroup[]> {
	return cached('apply:needs', async () => {
		const [categories, needs] = await Promise.all([
			db
				.select()
				.from(assistanceNeedCategories)
				.where(
					and(
						eq(assistanceNeedCategories.isActive, true),
						isNull(assistanceNeedCategories.deletedAt)
					)
				)
				.orderBy(asc(assistanceNeedCategories.sortOrder), asc(assistanceNeedCategories.id)),
			db
				.select()
				.from(assistanceNeeds)
				.where(and(eq(assistanceNeeds.isActive, true), isNull(assistanceNeeds.deletedAt)))
				.orderBy(asc(assistanceNeeds.sortOrder), asc(assistanceNeeds.id))
		]);

		const toOption = (row: (typeof needs)[number]): NeedOption => ({
			id: row.id,
			slug: row.slug,
			name: row.name,
			description: row.description,
			evidenceHint: row.evidenceHint,
			pillarId: row.pillarId,
			categoryId: row.categoryId
		});

		const groups: NeedGroup[] = categories.map((category) => ({
			id: category.id,
			name: category.name,
			description: category.description,
			icon: category.icon,
			needs: needs.filter((need) => need.categoryId === category.id).map(toOption)
		}));

		const known = new Set(categories.map((category) => category.id));
		const orphans = needs.filter((need) => !need.categoryId || !known.has(need.categoryId));
		if (orphans.length) {
			groups.push({
				id: null,
				name: 'Something else',
				description: null,
				icon: null,
				needs: orphans.map(toOption)
			});
		}

		return groups.filter((group) => group.needs.length > 0);
	});
}

export async function getLanguages() {
	return cached('apply:languages', async () =>
		db
			.select({
				id: languages.id,
				slug: languages.slug,
				name: languages.name,
				nativeName: languages.nativeName
			})
			.from(languages)
			.where(and(eq(languages.isActive, true), isNull(languages.deletedAt)))
			.orderBy(asc(languages.sortOrder), asc(languages.id))
	);
}

/** Everything `/apply` needs to render its form, in one call. */
export async function getApplyCatalog() {
	const [needs, languageRows, pillarRows, regionRows] = await Promise.all([
		getAssistanceNeeds(),
		getLanguages(),
		db
			.select({
				id: pillars.id,
				slug: pillars.slug,
				name: pillars.name,
				summary: pillars.summary,
				icon: pillars.icon,
				hasPublicApplication: pillars.hasPublicApplication
			})
			.from(pillars)
			.where(and(eq(pillars.isActive, true), isNull(pillars.deletedAt)))
			.orderBy(asc(pillars.sortOrder), asc(pillars.id)),
		db
			.select({ id: regions.id, name: regions.name, isDefault: regions.isDefault })
			.from(regions)
			.where(and(eq(regions.isActive, true), isNull(regions.deletedAt)))
			.orderBy(asc(regions.sortOrder), asc(regions.id))
	]);

	return { needs, languages: languageRows, pillars: pillarRows, regions: regionRows };
}

/* ==========================================================================
   The public submission
   ========================================================================== */

export type ApplySubmission = {
	/** Chosen by the applicant, or inferred from the needs they ticked. */
	pillarId: number | null;
	applyingFor: 'self' | 'other';
	relationship: string | null;

	/** The applicant — who is filling this in and who we reply to. */
	applicantName: string;
	applicantPhone: string | null;
	applicantEmail: string | null;

	/** The person being helped. Repeats the applicant when applying for self. */
	subjectName: string | null;
	subjectDateOfBirth: string | null;
	subjectApproximateAge: number | null;
	subjectGender: 'female' | 'male' | 'other' | 'undisclosed';
	subjectPhone: string | null;
	city: string | null;
	addressLine: string | null;
	regionId: number | null;

	householdSize: number | null;
	dependantsCount: number | null;
	/** Birr as entered; converted to santim before it is stored. */
	monthlyIncome: number | null;
	incomeSource: string | null;
	isEmployed: boolean | null;
	hasDisability: boolean | null;
	healthDetail: string | null;
	otherSupport: string | null;

	safeToContact: boolean;
	contactNotes: string | null;
	bestTimeToContact: string | null;
	alternateContactName: string | null;
	alternateContactPhone: string | null;

	writtenLanguageId: number | null;
	story: string;
	needs: {
		needId: number;
		detail: string | null;
		estimatedAmount: number | null;
		urgency: 'whenever' | 'weeks' | 'days' | 'immediate';
	}[];

	consentToVerify: boolean;
	consentToStore: boolean;

	documents: File[];
};

/**
 * The general application form, seeded for `/apply`. Applications that name no
 * programme land here rather than against a pillar's own form.
 */
export const GENERAL_APPLICATION_SLUG = 'assistance-application';

/** The form definition an application lands against, resolved by pillar. */
async function definitionForPillar(pillarId: number | null) {
	const rows = await db
		.select({
			id: formDefinitions.id,
			slug: formDefinitions.slug,
			pillarId: formDefinitions.pillarId,
			referencePrefix: formDefinitions.referencePrefix,
			statusContext: formDefinitions.statusContext
		})
		.from(formDefinitions)
		.where(isNull(formDefinitions.deletedAt));

	// The pillar's own application form first, then the general one the seed
	// creates for `/apply`. `form_submissions.form_definition_id` is NOT NULL,
	// so something has to be found — an applicant must never see an error
	// because of how the form builder happens to be configured.
	//
	// The general row is matched by slug rather than by "any definition with no
	// pillar", because `contact-form` is also pillar-less and carries the
	// `application` status context: falling through to it would file an
	// application under the contact form and give it an `MSG` reference.
	return (
		rows.find((row) => pillarId && row.pillarId === pillarId) ??
		rows.find((row) => row.slug === GENERAL_APPLICATION_SLUG) ??
		rows.find((row) => row.statusContext === 'application' && row.pillarId) ??
		rows[0] ??
		null
	);
}

/**
 * Writes one application.
 *
 * Every id from the browser is re-read against the live catalogue first: the
 * form only ever offers active rows, so anything else is a stale tab or
 * someone poking at the endpoint, and neither should create a dangling
 * reference or route a case to a programme that does not exist.
 *
 * The pillar is resolved from the needs when the applicant did not choose one.
 * Someone asking for help with medicine should not have to know which of the
 * Foundation's four programmes owns that.
 */
export async function createApplication(
	event: RequestEvent,
	input: ApplySubmission
): Promise<SubmitResult & { definitionSlug: string }> {
	const [validNeeds, validPillar, validRegion, validLanguage, defaultRegion] = await Promise.all([
		input.needs.length
			? db
					.select({ id: assistanceNeeds.id, pillarId: assistanceNeeds.pillarId })
					.from(assistanceNeeds)
					.where(
						and(
							inArray(
								assistanceNeeds.id,
								input.needs.map((need) => need.needId)
							),
							eq(assistanceNeeds.isActive, true),
							isNull(assistanceNeeds.deletedAt)
						)
					)
			: [],
		input.pillarId
			? db
					.select({ id: pillars.id })
					.from(pillars)
					.where(
						and(
							eq(pillars.id, input.pillarId),
							eq(pillars.isActive, true),
							isNull(pillars.deletedAt)
						)
					)
					.limit(1)
			: [],
		input.regionId
			? db
					.select({ id: regions.id })
					.from(regions)
					.where(and(eq(regions.id, input.regionId), isNull(regions.deletedAt)))
					.limit(1)
			: [],
		input.writtenLanguageId
			? db
					.select({ id: languages.id })
					.from(languages)
					.where(and(eq(languages.id, input.writtenLanguageId), isNull(languages.deletedAt)))
					.limit(1)
			: [],
		db
			.select({ id: regions.id })
			.from(regions)
			.where(and(eq(regions.isDefault, true), isNull(regions.deletedAt)))
			.limit(1)
	]);

	const needsById = new Map(validNeeds.map((need) => [need.id, need]));
	const chosenNeeds = input.needs.filter((need) => needsById.has(need.needId));

	// Falls back to the first pillar the chosen needs point at.
	const pillarId =
		validPillar[0]?.id ??
		chosenNeeds.map((need) => needsById.get(need.needId)?.pillarId).find((id) => id) ??
		null;

	const definition = await definitionForPillar(pillarId);
	const status = await defaultStatus('application');
	const regionId = validRegion[0]?.id ?? defaultRegion[0]?.id ?? null;
	const referenceNumber = nextSubmissionReference(definition?.referencePrefix ?? 'APP');
	const now = new Date();

	// The subject repeats the applicant when they are the same person, so "who
	// is being helped" is one place to look regardless of who filled the form.
	const subjectName =
		input.applyingFor === 'self' ? input.applicantName : (input.subjectName ?? input.applicantName);
	const subjectPhone = input.applyingFor === 'self' ? input.applicantPhone : input.subjectPhone;

	const submissionId = db.transaction((tx) => {
		const [submission] = tx
			.insert(formSubmissions)
			.values({
				formDefinitionId: definition!.id,
				referenceNumber,
				// The narrative and anything without a column of its own. The case
				// screen renders this the same way it renders a dynamic form's answers.
				data: {
					story: input.story,
					applying_for: input.applyingFor,
					relationship: input.relationship,
					other_support: input.otherSupport
				},
				statusId: status?.id ?? null,
				pillarId,
				submittedByName: input.applicantName,
				submittedByPhone: input.applicantPhone,
				submittedByEmail: input.applicantEmail,
				regionId,
				// Immediate needs arrive as urgent so they surface at the top of the
				// queue without waiting for a human to triage them.
				priority: chosenNeeds.some((need) => need.urgency === 'immediate') ? 'urgent' : 'normal',
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: formSubmissions.id })
			.all();

		const id = submission.id;

		tx.insert(applicationSubjects)
			.values({
				formSubmissionId: id,
				applyingFor: input.applyingFor,
				relationship: input.applyingFor === 'other' ? input.relationship : null,
				fullName: subjectName,
				dateOfBirth: input.subjectDateOfBirth,
				approximateAge: input.subjectApproximateAge,
				gender: input.subjectGender,
				phone: subjectPhone,
				city: input.city,
				addressLine: input.addressLine,
				regionId,
				householdSize: input.householdSize,
				dependantsCount: input.dependantsCount,
				// Entered in birr, stored in santim — see `$lib/money`.
				monthlyIncome: input.monthlyIncome === null ? null : Math.round(input.monthlyIncome * 100),
				incomeSource: input.incomeSource,
				isEmployed: input.isEmployed,
				hasDisability: input.hasDisability,
				healthDetail: input.healthDetail,
				otherSupport: input.otherSupport,
				safeToContact: input.safeToContact,
				contactNotes: input.contactNotes,
				bestTimeToContact: input.bestTimeToContact,
				alternateContactName: input.alternateContactName,
				alternateContactPhone: input.alternateContactPhone,
				writtenLanguageId: validLanguage[0]?.id ?? null,
				// Stamped from the server clock, never from anything posted.
				consentToVerifyAt: input.consentToVerify ? now : null,
				consentToStoreAt: input.consentToStore ? now : null,
				createdAt: now,
				updatedAt: now
			})
			.run();

		if (chosenNeeds.length) {
			tx.insert(applicationNeeds)
				.values(
					chosenNeeds.map((need) => ({
						formSubmissionId: id,
						needId: need.needId,
						detail: need.detail,
						estimatedAmount:
							need.estimatedAmount === null ? null : Math.round(need.estimatedAmount * 100),
						urgency: need.urgency
					}))
				)
				.run();
		}

		return id;
	});

	// Documents are saved after the transaction: a failed upload must not lose
	// an application that is otherwise complete, and a case with a missing
	// attachment is far better than no case at all.
	for (const file of input.documents) {
		if (!file || file.size === 0) continue;
		try {
			const saved = await saveUploadedFile(file, { isPublic: false, pillarId });
			await db.insert(formSubmissionDocuments).values({
				formSubmissionId: submissionId,
				fileId: saved.id,
				label: file.name,
				fieldKey: 'apply_upload'
			});
		} catch (err) {
			console.error('application document failed', err);
		}
	}

	audit({
		event,
		action: 'created',
		entityType: 'form_submission',
		entityId: submissionId,
		metadata: {
			reference: referenceNumber,
			applyingFor: input.applyingFor,
			needs: chosenNeeds.length,
			pillarId
		}
	});

	// The slug travels back so the caller can notify the staff who are listed
	// on *that* form definition — the Medical Hardship team for a medical case.
	return { id: submissionId, referenceNumber, definitionSlug: definition!.slug };
}

/* ==========================================================================
   Accepting an application
   ========================================================================== */

/**
 * Creates or finds the beneficiary record for the person an application is
 * about, and links the case to it.
 *
 * Deliberately keyed on the **subject**, not the applicant. `linkBeneficiary`
 * in `$lib/server/submissions` predates `application_subjects` and uses
 * `submitted_by_*`, which is correct only when someone applied for themselves
 * — for a daughter applying on behalf of her mother it would create a
 * beneficiary record in the daughter's name, and every disbursement after that
 * would be recorded against the wrong person.
 *
 * Matching is on the subject's phone, then on name plus date of birth, so a
 * family that comes back next year is recognised rather than duplicated.
 */
export async function acceptApplication(
	event: RequestEvent,
	submissionId: number,
	userId: string
): Promise<{ beneficiaryId: number; created: boolean }> {
	const [submission] = await db
		.select({
			id: formSubmissions.id,
			reference: formSubmissions.referenceNumber,
			beneficiaryId: formSubmissions.submittedByBeneficiaryId,
			name: formSubmissions.submittedByName,
			phone: formSubmissions.submittedByPhone,
			email: formSubmissions.submittedByEmail,
			regionId: formSubmissions.regionId
		})
		.from(formSubmissions)
		.where(eq(formSubmissions.id, submissionId))
		.limit(1);

	if (!submission) throw new Error('That application no longer exists.');

	// Already linked: return the existing record rather than making a second.
	if (submission.beneficiaryId) {
		return { beneficiaryId: submission.beneficiaryId, created: false };
	}

	const [subject] = await db
		.select()
		.from(applicationSubjects)
		.where(eq(applicationSubjects.formSubmissionId, submissionId))
		.limit(1);

	const fullName =
		subject?.fullName?.trim() || submission.name?.trim() || `Applicant ${submission.reference}`;
	const phone = subject?.phone?.trim() || submission.phone?.trim() || null;
	const regionId = subject?.regionId ?? submission.regionId ?? null;

	let beneficiaryId: number | null = null;

	if (phone) {
		const [existing] = await db
			.select({ id: beneficiaries.id })
			.from(beneficiaries)
			.where(and(eq(beneficiaries.phone, phone), isNull(beneficiaries.deletedAt)))
			.limit(1);
		beneficiaryId = existing?.id ?? null;
	}

	// Name alone is too weak a key — there are many Abebes — so the fallback
	// match needs a date of birth alongside it.
	if (!beneficiaryId && subject?.dateOfBirth) {
		const [existing] = await db
			.select({ id: beneficiaries.id })
			.from(beneficiaries)
			.where(
				and(
					eq(beneficiaries.fullName, fullName),
					eq(beneficiaries.dateOfBirth, subject.dateOfBirth),
					isNull(beneficiaries.deletedAt)
				)
			)
			.limit(1);
		beneficiaryId = existing?.id ?? null;
	}

	const created = !beneficiaryId;

	if (!beneficiaryId) {
		const [row] = await db
			.insert(beneficiaries)
			.values({
				fullName,
				phone,
				// Only the applicant gave an email, and only they should be emailed;
				// it is carried over only when they are the same person.
				email: subject?.applyingFor === 'self' ? submission.email : null,
				regionId,
				dateOfBirth: subject?.dateOfBirth ?? null,
				gender: subject?.gender ?? 'undisclosed',
				languageId: subject?.writtenLanguageId ?? null,
				createdBy: userId,
				updatedBy: userId
			})
			.returning({ id: beneficiaries.id });
		beneficiaryId = row.id;
	}

	await db
		.update(formSubmissions)
		.set({ submittedByBeneficiaryId: beneficiaryId, updatedAt: new Date() })
		.where(eq(formSubmissions.id, submissionId));

	audit({
		event,
		action: 'updated',
		entityType: 'form_submission',
		entityId: submissionId,
		metadata: { linkedBeneficiaryId: beneficiaryId, created, via: 'accept' }
	});

	return { beneficiaryId, created };
}

/** The subject, needs and uploads behind one case — for the staff screen. */
export async function getApplicationDetail(submissionId: number) {
	const [subject, needs, documents] = await Promise.all([
		db
			.select({
				applyingFor: applicationSubjects.applyingFor,
				relationship: applicationSubjects.relationship,
				fullName: applicationSubjects.fullName,
				dateOfBirth: applicationSubjects.dateOfBirth,
				approximateAge: applicationSubjects.approximateAge,
				gender: applicationSubjects.gender,
				phone: applicationSubjects.phone,
				city: applicationSubjects.city,
				addressLine: applicationSubjects.addressLine,
				householdSize: applicationSubjects.householdSize,
				dependantsCount: applicationSubjects.dependantsCount,
				monthlyIncome: applicationSubjects.monthlyIncome,
				incomeSource: applicationSubjects.incomeSource,
				isEmployed: applicationSubjects.isEmployed,
				hasDisability: applicationSubjects.hasDisability,
				healthDetail: applicationSubjects.healthDetail,
				otherSupport: applicationSubjects.otherSupport,
				safeToContact: applicationSubjects.safeToContact,
				contactNotes: applicationSubjects.contactNotes,
				bestTimeToContact: applicationSubjects.bestTimeToContact,
				alternateContactName: applicationSubjects.alternateContactName,
				alternateContactPhone: applicationSubjects.alternateContactPhone,
				consentToVerifyAt: applicationSubjects.consentToVerifyAt,
				consentToStoreAt: applicationSubjects.consentToStoreAt,
				languageName: languages.name,
				languageNativeName: languages.nativeName,
				regionName: regions.name
			})
			.from(applicationSubjects)
			.leftJoin(languages, eq(languages.id, applicationSubjects.writtenLanguageId))
			.leftJoin(regions, eq(regions.id, applicationSubjects.regionId))
			.where(eq(applicationSubjects.formSubmissionId, submissionId))
			.limit(1),

		db
			.select({
				id: applicationNeeds.id,
				detail: applicationNeeds.detail,
				estimatedAmount: applicationNeeds.estimatedAmount,
				currency: applicationNeeds.currency,
				urgency: applicationNeeds.urgency,
				name: assistanceNeeds.name,
				evidenceHint: assistanceNeeds.evidenceHint,
				categoryName: assistanceNeedCategories.name
			})
			.from(applicationNeeds)
			.innerJoin(assistanceNeeds, eq(assistanceNeeds.id, applicationNeeds.needId))
			.leftJoin(
				assistanceNeedCategories,
				eq(assistanceNeedCategories.id, assistanceNeeds.categoryId)
			)
			.where(eq(applicationNeeds.formSubmissionId, submissionId))
			.orderBy(asc(applicationNeeds.id)),

		db
			.select({
				id: formSubmissionDocuments.id,
				label: formSubmissionDocuments.label,
				storagePath: files.storagePath,
				mimeType: files.mimeType,
				sizeBytes: files.sizeBytes
			})
			.from(formSubmissionDocuments)
			.innerJoin(files, eq(files.id, formSubmissionDocuments.fileId))
			.where(
				and(
					eq(formSubmissionDocuments.formSubmissionId, submissionId),
					isNull(formSubmissionDocuments.deletedAt)
				)
			)
	]);

	return { subject: subject[0] ?? null, needs, documents };
}
