import { contentCrud } from '$lib/server/crud';
import { helpTopics } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: helpTopics,
	label: 'Help topic',
	addSchema,
	editSchema,
	permission: 'content.manage',
	entity: 'help_topic',
	// A prefix, so an edit reaches every page's panel and not just the donate one.
	invalidates: ['help']
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
