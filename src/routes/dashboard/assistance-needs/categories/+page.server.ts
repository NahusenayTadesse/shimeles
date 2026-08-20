import { contentCrud } from '$lib/server/crud';
import { assistanceNeedCategories } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: assistanceNeedCategories,
	label: 'Need group',
	addSchema,
	editSchema,
	permission: 'settings.manage',
	entity: 'assistance_catalog',
	invalidates: ['apply']
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
