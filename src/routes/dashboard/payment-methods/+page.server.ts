import { contentCrud } from '$lib/server/crud';
import { paymentMethods } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

const crud = contentCrud({
	table: paymentMethods,
	label: 'Payment method',
	addSchema,
	editSchema,
	permission: 'settings.manage',
	entity: 'site_setting',
	fileFields: ['logo'],
	invalidates: ['payment-options']
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
