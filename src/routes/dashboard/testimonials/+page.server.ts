import { asc, isNull } from 'drizzle-orm';
import { contentCrud } from '$lib/server/crud';
import { db } from '$lib/server/db';
import { pillars, testimonials } from '$lib/server/db/schema';
import { deleteMediaFor } from '$lib/server/media';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: testimonials,
	label: 'Testimonial',
	addSchema,
	editSchema,
	permission: 'content.manage',
	entity: 'testimonial',
	fileFields: ['photo'],
	invalidates: ['testimonials', 'page']
});

export const load: PageServerLoad = async (event) => {
	const base = await crud.load(event);

	const pillarOptions = await db
		.select({ id: pillars.id, name: pillars.name })
		.from(pillars)
		.where(isNull(pillars.deletedAt))
		.orderBy(asc(pillars.sortOrder), asc(pillars.id));

	return { ...base, pillarOptions };
};

export const actions: Actions = {
	...crud.actions,

	/**
	 * Deleting a testimonial has to take its photographs with it.
	 *
	 * `media_items.owner_id` is polymorphic and so carries no foreign key —
	 * SQLite cannot cascade from a column that points at nine different tables.
	 * This is the stand-in, and it is why the generic delete is wrapped rather
	 * than used directly. See the note in `schema.ts`.
	 */
	delete: async (event) => {
		const id = Number((await event.request.clone().formData()).get('id'));
		const result = await crud.actions.delete(event);
		if (Number.isFinite(id)) await deleteMediaFor('testimonial', id);
		return result;
	}
};
