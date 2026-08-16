import { asc, isNull } from 'drizzle-orm';
import { contentCrud } from '$lib/server/crud';
import { households, regions } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: households,
	label: 'Household',
	addSchema,
	editSchema,
	permission: 'beneficiaries.write',
	entity: 'household'
});

export const load: PageServerLoad = async (event) => {
	const base = await crud.load(event);
	const regionOptions = await db
		.select({ id: regions.id, name: regions.name })
		.from(regions)
		.where(isNull(regions.deletedAt))
		.orderBy(asc(regions.sortOrder));

	return { ...base, regionOptions };
};

export const actions: Actions = crud.actions;
