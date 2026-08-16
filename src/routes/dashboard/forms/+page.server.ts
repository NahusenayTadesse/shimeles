import { asc, isNull } from 'drizzle-orm';
import { contentCrud } from '$lib/server/crud';
import { formDefinitions, pillars } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * The list of forms. The *questions* on each one are edited on the detail
 * screen, which is the purpose-built builder §5.4 asks for.
 */
const crud = contentCrud({
	table: formDefinitions,
	label: 'Form',
	addSchema,
	editSchema,
	permission: 'forms.manage',
	entity: 'form_definition',
	invalidates: ['form', 'forms:list']
});

export const load: PageServerLoad = async (event) => {
	const base = await crud.load(event);
	const pillarOptions = await db
		.select({ id: pillars.id, name: pillars.name })
		.from(pillars)
		.where(isNull(pillars.deletedAt))
		.orderBy(asc(pillars.sortOrder));

	return { ...base, pillarOptions };
};

export const actions: Actions = crud.actions;
