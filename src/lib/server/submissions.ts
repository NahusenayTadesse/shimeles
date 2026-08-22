import { and, eq, isNull } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	beneficiaries,
	formDefinitions,
	formFields,
	formSubmissionDocuments,
	formSubmissions,
	regions
} from '$lib/server/db/schema';
import { saveUploadedFile } from '$lib/server/upload';
import { nextSubmissionReference, withReference } from '$lib/server/reference';
import { defaultStatus } from '$lib/server/workflow';
import { audit } from '$lib/server/audit';
import { isFieldVisible } from '$lib/server/forms';
import type { RenderForm } from '$lib/forms/types';

/**
 * Turning a validated dynamic-form payload into a case file.
 *
 * One function serves all six seeded forms and anything staff add later,
 * because everything specific to a form — its questions, its pillar, its
 * reference prefix, whether it takes documents — is data on the definition
 * rather than a branch in here.
 */

export interface SubmitResult {
	id: number;
	referenceNumber: string;
}

/**
 * Splits the flat validated payload into the three places it belongs:
 * `data` (the JSON answers), the denormalised contact columns, and file
 * uploads bound for `form_submission_documents`.
 */
export async function submitForm(
	event: RequestEvent,
	form: RenderForm,
	payload: Record<string, unknown>
): Promise<SubmitResult> {
	const [definition] = await db
		.select()
		.from(formDefinitions)
		.where(and(eq(formDefinitions.id, form.id), isNull(formDefinitions.deletedAt)))
		.limit(1);

	if (!definition) throw new Error('That form is no longer available.');

	const answers: Record<string, unknown> = {};
	const uploads: { field: string; label: string; file: File }[] = [];

	// Values mapped onto the submission's own columns, from fields whose
	// `mapsTo` says so — which is how a free-text "your name" question becomes
	// `submittedByName` without this file knowing which question that is.
	const mapped: Record<string, string | null> = {};

	for (const field of form.fields) {
		if (field.type === 'heading') continue;

		// A conditional field whose condition is not met contributes nothing —
		// stripped server-side, so a hidden answer cannot be smuggled in.
		if (!isFieldVisible(field, payload)) continue;

		const value = payload[field.key];

		if (field.type === 'file_upload') {
			if (value instanceof File && value.size > 0) {
				uploads.push({ field: field.key, label: field.label, file: value });
				answers[field.key] = value.name;
			}
			continue;
		}

		if (value === undefined || value === '') continue;
		answers[field.key] = value;
	}

	// The mapped-column pass reads the raw field rows, since `mapsTo` is not
	// part of the render shape (the public form has no use for it).
	const mappedFields = await db
		.select({ fieldKey: formFields.fieldKey, mapsTo: formFields.mapsTo })
		.from(formFields)
		.where(and(eq(formFields.formDefinitionId, definition.id), isNull(formFields.deletedAt)));

	for (const field of mappedFields) {
		if (!field.mapsTo) continue;
		const value = answers[field.fieldKey];
		if (value == null || value === '') continue;
		mapped[field.mapsTo] = String(value);
	}

	const regionId = await resolveRegion(mapped.region ?? null);
	const status = await defaultStatus(definition.statusContext);
	// The reference and the row it belongs to commit together — see
	// `withReference`. Read outside a transaction, two submissions arriving
	// together can derive the same `max(existing)` and collide on a UNIQUE column.
	const { id: submissionId, referenceNumber } = withReference(() => {
		const referenceNumber = nextSubmissionReference(definition.referencePrefix);

		const [submission] = db
			.insert(formSubmissions)
			.values({
				formDefinitionId: definition.id,
				referenceNumber,
				data: answers,
				statusId: status?.id ?? null,
				// Denormalised so the case list filters by pillar without a join, and
				// so the case keeps its pillar if the form is later repointed.
				pillarId: definition.pillarId,
				// The explicit contact fields on the form win over a mapped question,
				// since they are the ones the submitter saw labelled as contact details.
				submittedByName: str(payload.submittedByName) ?? mapped.name ?? null,
				submittedByPhone: str(payload.submittedByPhone) ?? mapped.phone ?? null,
				submittedByEmail: str(payload.submittedByEmail) ?? mapped.email ?? null,
				regionId,
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning({ id: formSubmissions.id })
			.all();

		return { id: submission.id, referenceNumber };
	});

	// Documents are stored private and scoped to the form's pillar, so the
	// §3.10 rule ("Mental Wellness staff must not see Medical Hardship
	// documents") holds at the file-serving layer as well as the query layer.
	for (const upload of uploads) {
		const saved = await saveUploadedFile(upload.file, {
			isPublic: false,
			pillarId: definition.pillarId
		});
		await db.insert(formSubmissionDocuments).values({
			formSubmissionId: submissionId,
			fileId: saved.id,
			label: upload.label,
			fieldKey: upload.field
		});
	}

	audit({
		event,
		action: 'created',
		entityType: 'form_submission',
		entityId: submissionId,
		metadata: { form: definition.slug, reference: referenceNumber, documents: uploads.length }
	});

	return { id: submissionId, referenceNumber };
}

const str = (value: unknown): string | null => {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed ? trimmed : null;
};

/**
 * Maps a free-text or slug region answer onto a `regions` row, falling back to
 * the default region. Every record needs a region now even though v1 only ever
 * populates one value (§1), so this never returns null when a default exists.
 */
async function resolveRegion(answer: string | null): Promise<number | null> {
	const rows = await db
		.select({
			id: regions.id,
			slug: regions.slug,
			name: regions.name,
			isDefault: regions.isDefault
		})
		.from(regions)
		.where(and(eq(regions.isActive, true), isNull(regions.deletedAt)));

	if (answer) {
		const needle = answer.trim().toLowerCase();
		const match = rows.find(
			(row) => row.slug === needle || row.name.toLowerCase() === needle || String(row.id) === needle
		);
		if (match) return match.id;
	}

	return rows.find((row) => row.isDefault)?.id ?? rows[0]?.id ?? null;
}

/**
 * Links a submission to a beneficiary record, creating one when this is a new
 * person. This is what satisfies the continuity-of-care requirement in §3.4:
 * a family that came back last year is recognised rather than re-entered.
 *
 * Matching is on phone number, deliberately narrow — names repeat, and
 * silently merging two households would be worse than creating a duplicate a
 * caseworker can merge by hand.
 */
export async function linkBeneficiary(
	event: RequestEvent,
	submissionId: number,
	userId: string
): Promise<number | null> {
	const [submission] = await db
		.select()
		.from(formSubmissions)
		.where(eq(formSubmissions.id, submissionId))
		.limit(1);

	if (!submission || submission.submittedByBeneficiaryId) {
		return submission?.submittedByBeneficiaryId ?? null;
	}

	let beneficiaryId: number | null = null;

	if (submission.submittedByPhone) {
		const [existing] = await db
			.select({ id: beneficiaries.id })
			.from(beneficiaries)
			.where(
				and(eq(beneficiaries.phone, submission.submittedByPhone), isNull(beneficiaries.deletedAt))
			)
			.limit(1);
		beneficiaryId = existing?.id ?? null;
	}

	if (!beneficiaryId) {
		const [created] = await db
			.insert(beneficiaries)
			.values({
				fullName: submission.submittedByName ?? `Applicant ${submission.referenceNumber}`,
				phone: submission.submittedByPhone,
				email: submission.submittedByEmail,
				regionId: submission.regionId,
				createdBy: userId,
				updatedBy: userId
			})
			.returning({ id: beneficiaries.id });
		beneficiaryId = created.id;
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
		metadata: { linkedBeneficiaryId: beneficiaryId }
	});

	return beneficiaryId;
}
