import { asc, isNull } from 'drizzle-orm';
import { contentCrud } from '$lib/server/crud';
import { db } from '$lib/server/db';
import { contactOffices, regions } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: contactOffices,
	label: 'Office',
	addSchema,
	editSchema,
	permission: 'settings.manage',
	entity: 'contact_catalog',
	invalidates: ['contact']
});

export const load: PageServerLoad = async (event) => {
	const base = await crud.load(event);

	const regionRows = await db
		.select({ id: regions.id, name: regions.name })
		.from(regions)
		.where(isNull(regions.deletedAt))
		.orderBy(asc(regions.sortOrder), asc(regions.id));

	return { ...base, regionOptions: regionRows };
};

export const actions: Actions = crud.actions;
