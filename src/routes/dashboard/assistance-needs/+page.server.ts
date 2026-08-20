import { asc, isNull } from 'drizzle-orm';
import { contentCrud } from '$lib/server/crud';
import { db } from '$lib/server/db';
import { assistanceNeedCategories, assistanceNeeds, pillars } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: assistanceNeeds,
	label: 'Kind of help',
	addSchema,
	editSchema,
	permission: 'settings.manage',
	entity: 'assistance_catalog',
	// Drops `apply:needs`, so the public form shows the edit immediately.
	invalidates: ['apply']
});

export const load: PageServerLoad = async (event) => {
	const base = await crud.load(event);

	const [categories, pillarRows] = await Promise.all([
		db
			.select({ id: assistanceNeedCategories.id, name: assistanceNeedCategories.name })
			.from(assistanceNeedCategories)
			.where(isNull(assistanceNeedCategories.deletedAt))
			.orderBy(asc(assistanceNeedCategories.sortOrder)),
		db
			.select({ id: pillars.id, name: pillars.name })
			.from(pillars)
			.where(isNull(pillars.deletedAt))
			.orderBy(asc(pillars.sortOrder))
	]);

	return { ...base, categories, pillarOptions: pillarRows };
};

export const actions: Actions = crud.actions;
