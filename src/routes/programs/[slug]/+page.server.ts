import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { db } from '$lib/server/db';
import { formDefinitions } from '$lib/server/db/schema';
import { getPillar } from '$lib/server/content';
import { buildSchema, loadForm } from '$lib/server/forms';
import { handleFormSubmission } from '$lib/server/formSubmit';
import type { Actions, PageServerLoad } from './$types';

/**
 * One pillar's own page.
 *
 * There is a single route for all four pillars — and for the fifth someone
 * adds from the dashboard — because a pillar is a row, not a code branch (§3.2).
 * The "Apply" button appears only when the pillar has `has_public_application`
 * set *and* an active form definition actually points at it, so a half-set-up
 * pillar cannot lead someone to a 404 — and the form itself renders right on
 * this page (see `#apply` below) rather than sending an applicant to a
 * separate `/forms/[slug]` screen.
 */
export const load: PageServerLoad = async ({ params }) => {
	const pillar = await getPillar(params.slug);
	if (!pillar) throw error(404, 'That programme does not exist.');

	const [formRow] = pillar.hasPublicApplication
		? await db
				.select({ slug: formDefinitions.slug, title: formDefinitions.title })
				.from(formDefinitions)
				.where(
					and(
						eq(formDefinitions.pillarId, pillar.id),
						eq(formDefinitions.isActive, true),
						isNull(formDefinitions.deletedAt)
					)
				)
				.limit(1)
		: [];

	if (!formRow) return { pillar, applicationForm: null };

	const definition = await loadForm(formRow.slug);
	if (!definition) return { pillar, applicationForm: null };

	return {
		pillar,
		applicationForm: {
			slug: formRow.slug,
			title: formRow.title,
			definition,
			data: await superValidate(zod4(buildSchema(definition)))
		}
	};
};

export const actions: Actions = {
	submit: async (event) => {
		const slug = event.url.searchParams.get('slug');
		if (!slug) throw error(400, 'Missing form slug.');

		const body = await event.request.formData();
		const result = await handleFormSubmission(event, slug, body);
		if (!result) throw error(404, 'That form is not available.');
		return result;
	}
};
