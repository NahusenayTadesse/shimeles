import { asc, isNull } from 'drizzle-orm';
import { contentCrud } from '$lib/server/crud';
import { db } from '$lib/server/db';
import { volunteerSkillCategories, volunteerSkills } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: volunteerSkills,
	label: 'Skill',
	addSchema,
	editSchema,
	permission: 'volunteers.write',
	entity: 'volunteer_catalog',
	// Drops `volunteer:skills`, so the public form shows the edit immediately
	// rather than up to a minute later.
	invalidates: ['volunteer']
});

export const load: PageServerLoad = async (event) => {
	const base = await crud.load(event);

	const categories = await db
		.select({ id: volunteerSkillCategories.id, name: volunteerSkillCategories.name })
		.from(volunteerSkillCategories)
		.where(isNull(volunteerSkillCategories.deletedAt))
		.orderBy(asc(volunteerSkillCategories.sortOrder), asc(volunteerSkillCategories.id));

	return { ...base, categories };
};

export const actions: Actions = crud.actions;
