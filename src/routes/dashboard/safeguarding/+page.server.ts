import { contentCrud } from '$lib/server/crud';
import { volunteerSafeguardingChecklistItems } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: volunteerSafeguardingChecklistItems,
	label: 'Checklist item',
	addSchema,
	editSchema,
	permission: 'volunteers.safeguarding',
	entity: 'volunteer_safeguarding_check'
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
