import { asc, isNull } from 'drizzle-orm';
import { contentCrud } from '$lib/server/crud';
import { paymentAccounts, paymentMethods } from '$lib/server/db/schema';
import { db } from '$lib/server/db';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: paymentAccounts,
	label: 'Payment account',
	addSchema,
	editSchema,
	permission: 'settings.manage',
	entity: 'site_setting',
	invalidates: ['payment-options']
});

export const load: PageServerLoad = async (event) => {
	const base = await crud.load(event);

	const methodOptions = await db
		.select({ id: paymentMethods.id, name: paymentMethods.name })
		.from(paymentMethods)
		.where(isNull(paymentMethods.deletedAt))
		.orderBy(asc(paymentMethods.sortOrder));

	return { ...base, methodOptions };
};

export const actions: Actions = crud.actions;
