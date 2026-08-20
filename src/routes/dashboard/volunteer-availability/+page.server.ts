import { contentCrud } from '$lib/server/crud';
import { volunteerTimeSlots } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: volunteerTimeSlots,
	label: 'Time slot',
	addSchema,
	editSchema,
	permission: 'volunteers.write',
	entity: 'volunteer_catalog',
	invalidates: ['volunteer']
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
