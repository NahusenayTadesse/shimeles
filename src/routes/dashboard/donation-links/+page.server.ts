import { contentCrud } from '$lib/server/crud';
import { donationCampaigns } from '$lib/server/db/schema';
import { addSchema, editSchema } from './schema';
import type { Actions, PageServerLoad } from './$types';

/**
 * External giving platforms — PayPal, Zeffy, whatever comes next.
 *
 * Generic CRUD: the whole point is that adding a platform, swapping a campaign
 * or turning one off is a row here, not a deploy. Guarded by `settings.manage`
 * rather than `donations.write`, because this is site configuration — it
 * decides what a visitor is offered, not what any donation record says.
 */
const crud = contentCrud({
	table: donationCampaigns,
	label: 'Donation link',
	addSchema,
	editSchema,
	permission: 'settings.manage',
	entity: 'site_setting',
	invalidates: ['donation-campaigns']
});

export const load: PageServerLoad = crud.load;
export const actions: Actions = crud.actions;
