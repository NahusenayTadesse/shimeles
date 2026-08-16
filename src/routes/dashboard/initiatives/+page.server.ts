import { contentCrud } from '$lib/server/crud';
import { futureInitiatives } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: futureInitiatives,
	label: 'Initiative',
	addSchema,
	editSchema,
	permission: 'pillars.manage',
	entity: 'pillar',
	fileFields: ['image'],
	invalidates: ['initiatives', 'page']
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
