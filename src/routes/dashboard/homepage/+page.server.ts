import { requirePermission } from '$lib/server/permissions';
import { audit } from '$lib/server/audit';
import { listMedia, mediaActions, prefixedMediaActions, type MediaScope } from '$lib/server/media';
import type { Actions, PageServerLoad } from './$types';

/**
 * The homepage editor — two independent photo sets: the hero gallery the
 * header rotates through (still falls back to the `hero.image` setting — see
 * `+page.svelte`), and a general gallery section further down the page.
 *
 * Both live in `media_items` as site-level collections, which is why their
 * owner id is 0: they belong to the site rather than to a row. All the CRUD
 * is `$lib/server/media`; this file only says which collections it manages.
 */
const heroScope: MediaScope = {
	ownerType: 'hero',
	ownerId: 0,
	permission: 'content.manage',
	invalidates: 'heroGallery'
};

const stripScope: MediaScope = {
	ownerType: 'homepage',
	ownerId: 0,
	permission: 'content.manage',
	invalidates: 'homepageGallery'
};

export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'content.manage');

	const [gallery, homepageGallery] = await Promise.all([
		listMedia(heroScope, 'image'),
		listMedia(stripScope, 'image')
	]);

	audit({ event, action: 'viewed', entityType: 'media_item', entityId: null });

	return { gallery, homepageGallery };
};

export const actions: Actions = {
	...mediaActions(() => heroScope),
	...prefixedMediaActions('homepage', () => stripScope)
};
