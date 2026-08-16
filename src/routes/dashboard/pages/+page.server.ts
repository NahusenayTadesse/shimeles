import { contentCrud } from '$lib/server/crud';
import { pages } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: pages,
	label: 'Page',
	addSchema,
	editSchema,
	permission: 'content.manage',
	entity: 'page',
	fileFields: ['shareImage'],
	// A page rename changes the nav label target as well as the page itself.
	invalidates: ['page', 'pages:list', 'nav']
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
