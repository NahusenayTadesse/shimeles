import { asc, isNull } from 'drizzle-orm';
import { contentCrud } from '$lib/server/crud';
import { navigationItems, pages } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: navigationItems,
	label: 'Navigation item',
	addSchema,
	editSchema,
	permission: 'content.manage',
	entity: 'page',
	invalidates: ['nav']
});

export const load: PageServerLoad = async (event) => {
	const base = await crud.load(event);

	// The page picker and the parent picker both need live options; a nav item
	// pointing at a deleted page would 404 the visitor.
	const [pageOptions, navOptions] = await Promise.all([
		db
			.select({ id: pages.id, title: pages.title })
			.from(pages)
			.where(isNull(pages.deletedAt))
			.orderBy(asc(pages.sortOrder)),
		db
			.select({ id: navigationItems.id, label: navigationItems.label })
			.from(navigationItems)
			.where(isNull(navigationItems.deletedAt))
			.orderBy(asc(navigationItems.sortOrder))
	]);

	return { ...base, pageOptions, navOptions };
};

export const actions: Actions = crud.actions;
