import { contentCrud } from '$lib/server/crud';
import { blogCategories } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: blogCategories,
	label: 'Category',
	addSchema,
	editSchema,
	permission: 'content.manage',
	entity: 'blog_category',
	// A renamed category changes the chips on `/blog` and the label on every
	// card, so the post list has to be dropped alongside the category list.
	invalidates: ['blog', 'blog-categories']
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
