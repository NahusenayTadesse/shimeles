import { contentCrud } from '$lib/server/crud';
import { pillars } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: pillars,
	label: 'Pillar',
	addSchema,
	editSchema,
	permission: 'pillars.manage',
	entity: 'pillar',
	fileFields: ['image'],
	// The public pillar grid, the donate page's designation picker and the
	// programme pages all read the cached pillar list.
	invalidates: ['pillars', 'page', 'forms:list']
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
