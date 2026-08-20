import { contentCrud } from '$lib/server/crud';
import { volunteerSkillCategories } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: volunteerSkillCategories,
	label: 'Skill group',
	addSchema,
	editSchema,
	permission: 'volunteers.write',
	entity: 'volunteer_catalog',
	invalidates: ['volunteer']
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
