import { error, type RequestEvent } from '@sveltejs/kit';
import { requirePermission } from '$lib/server/permissions';
import { audit } from '$lib/server/audit';
import { MEDIA_OWNERS, type MediaOwner } from '$lib/server/db/schema';
import {
	cacheGroupFor,
	describeOwner,
	listMediaSplit,
	mediaActions,
	mediaVideoActions,
	type MediaScope
} from '$lib/server/media';
import type { Actions, PageServerLoad } from './$types';

/**
 * Photographs and videos, for any owner that has them.
 *
 * One screen rather than one per entity. Every media-owning row — a
 * programme, an initiative, a giving platform, a testimonial, a page section —
 * links here, and adding media to the next entity is a link and an
 * `owner_type`, with no new route, no new component and no new actions.
 *
 * The site-level collections (the homepage hero, the About gallery) keep their
 * own screens, because there the photographs are one part of a larger editor
 * rather than the whole point of the page.
 */
const scopeFrom = (event: RequestEvent): MediaScope => {
	const ownerType = event.params.ownerType as MediaOwner;

	// The owner type reaches a query, so it is checked against the enum rather
	// than trusted. Anything else is a 404, not a cast.
	if (!MEDIA_OWNERS.includes(ownerType)) throw error(404, 'Not found');

	const ownerId = Number(event.params.ownerId);
	if (!Number.isFinite(ownerId) || ownerId < 1) throw error(404, 'Not found');

	return {
		ownerType,
		ownerId,
		permission: 'content.manage',
		invalidates: cacheGroupFor(ownerType)
	};
};

export const load: PageServerLoad = async (event) => {
	await requirePermission(event, 'content.manage');

	const scope = scopeFrom(event as never);
	const owner = await describeOwner(scope.ownerType, scope.ownerId);
	if (!owner) throw error(404, 'That item does not exist.');

	const { images, videos } = await listMediaSplit(scope);

	audit({ event, action: 'viewed', entityType: 'media_item', entityId: scope.ownerId });

	return { owner, ownerType: scope.ownerType, gallery: images, videos };
};

export const actions: Actions = {
	...mediaActions(scopeFrom),
	...mediaVideoActions(scopeFrom)
};
