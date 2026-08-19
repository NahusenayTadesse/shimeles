import { error } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { getInitiatives, getPage, getPaymentOptions, getPillars } from '$lib/server/content';
import { getImpactMetrics } from '$lib/server/impact';
import { buildSchema, loadForm } from '$lib/server/forms';
import type { RenderBlock } from '$lib/content/types';

/**
 * Assembles everything a content-driven page needs.
 *
 * Blocks can reference the pillar list, the impact counters, the initiative
 * list or the bank details, and which of those a page needs depends on what a
 * staff member put on it — so the block types actually present decide what is
 * fetched. A page with no `stat_counter` block never queries the metrics.
 */
export async function loadPageData(slug: string) {
	const page = await getPage(slug);
	if (!page) throw error(404, 'That page does not exist.');

	return { ...(await hydrateBlocks(page.blocks)), page };
}

/** The same block-driven fetch, for routes that assemble their own page shell. */
export async function hydrateBlocks(blocks: RenderBlock[]) {
	const types = new Set(blocks.map((block) => block.type));

	const formSlugs = [
		...new Set(
			blocks
				.filter((block) => block.type === 'form_embed')
				.map((block) => String(block.content.slug ?? ''))
				.filter(Boolean)
		)
	];

	const [pillars, initiatives, metrics, payments, forms] = await Promise.all([
		types.has('pillar_grid') ? getPillars() : Promise.resolve([]),
		types.has('initiative_grid') ? getInitiatives() : Promise.resolve([]),
		types.has('stat_counter') ? getImpactMetrics() : Promise.resolve(null),
		types.has('donation_details') ? getPaymentOptions() : Promise.resolve([]),
		formSlugs.length ? loadEmbeddedForms(formSlugs) : Promise.resolve({})
	]);

	return {
		pillars,
		initiatives,
		metrics: metrics?.values ?? {},
		payments,
		forms
	};
}

/**
 * A `form_embed` block renders its form inline rather than linking out to
 * `/forms/[slug]` — see `BlockRenderer`. That needs the same definition +
 * empty superform `/forms/[slug]`'s `load` builds, keyed by slug so a page
 * embedding more than one form (not used today, but not forbidden) still
 * works.
 */
async function loadEmbeddedForms(slugs: string[]) {
	const entries = await Promise.all(
		slugs.map(async (slug) => {
			const definition = await loadForm(slug);
			if (!definition) return null;
			return [
				slug,
				{ definition, data: await superValidate(zod4(buildSchema(definition))) }
			] as const;
		})
	);

	return Object.fromEntries(entries.filter((entry) => entry !== null));
}
