import { contentCrud } from '$lib/server/crud';
import { statusOptions } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: statusOptions,
	label: 'Status',
	addSchema,
	editSchema,
	permission: 'settings.manage',
	entity: 'site_setting',
	invalidates: ['statuses', 'impact']
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
