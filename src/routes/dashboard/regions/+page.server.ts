import { contentCrud } from '$lib/server/crud';
import { regions } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: regions,
	label: 'Region',
	addSchema,
	editSchema,
	permission: 'settings.manage',
	entity: 'site_setting',
	invalidates: ['regions']
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
