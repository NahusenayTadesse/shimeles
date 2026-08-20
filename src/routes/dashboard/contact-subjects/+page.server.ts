import { asc, isNull } from 'drizzle-orm';
import { contentCrud } from '$lib/server/crud';
import { db } from '$lib/server/db';
import { contactSubjects, pillars, user } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: contactSubjects,
	label: 'Enquiry topic',
	addSchema,
	editSchema,
	permission: 'settings.manage',
	entity: 'contact_catalog',
	// One address per line in the textarea, a JSON array in the column.
	listFields: ['notifyEmails'],
	// Drops `contact:subjects`, so the public form shows the edit immediately.
	invalidates: ['contact']
});

export const load: PageServerLoad = async (event) => {
	const base = await crud.load(event);

	const [pillarRows, staff] = await Promise.all([
		db
			.select({ id: pillars.id, name: pillars.name })
			.from(pillars)
			.where(isNull(pillars.deletedAt))
			.orderBy(asc(pillars.sortOrder)),
		db.select({ id: user.id, name: user.name }).from(user).orderBy(asc(user.name))
	]);

	return {
		...base,
		pillarOptions: pillarRows,
		staff,
		// The dialog edits `notifyEmails` as text; the column stores an array.
		rows: base.rows.map((row) => ({
			...row,
			notifyEmails: (row.notifyEmails ?? []).join('\n')
		}))
	};
};

export const actions: Actions = crud.actions;
