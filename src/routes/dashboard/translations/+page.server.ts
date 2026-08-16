import { contentCrud } from '$lib/server/crud';
import { translations } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: translations,
	label: 'Translation',
	addSchema,
	editSchema,
	permission: 'content.manage',
	entity: 'site_setting',
	invalidates: ['translations']
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
