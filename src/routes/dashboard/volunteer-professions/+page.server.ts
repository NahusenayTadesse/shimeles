import { contentCrud } from '$lib/server/crud';
import { volunteerProfessions } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: volunteerProfessions,
	label: 'Profession',
	addSchema,
	editSchema,
	permission: 'volunteers.write',
	entity: 'volunteer_catalog',
	invalidates: ['volunteer']
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
