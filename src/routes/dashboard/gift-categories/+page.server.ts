import { asc, isNull } from 'drizzle-orm';
import { contentCrud } from '$lib/server/crud';
import { db } from '$lib/server/db';
import { inKindCategories, pillars } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: inKindCategories,
	label: 'Gift category',
	addSchema,
	editSchema,
	permission: 'settings.manage',
	entity: 'in_kind_catalog',
	// Drops the cached catalogue, so the donate page shows the edit immediately.
	invalidates: ['in-kind-categories']
});

export const load: PageServerLoad = async (event) => {
	const base = await crud.load(event);

	const pillarRows = await db
		.select({ id: pillars.id, name: pillars.name })
		.from(pillars)
		.where(isNull(pillars.deletedAt))
		.orderBy(asc(pillars.sortOrder));

	return { ...base, pillarOptions: pillarRows };
};

export const actions: Actions = crud.actions;
