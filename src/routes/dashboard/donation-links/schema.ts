import { z } from 'zod/v4';
import { flagField, optionalText, slugField, sortOrderField } from '$lib/server/crud';
import { isUsablePaypalUrl } from '$lib/donations';

/**
 * An external giving platform.
 *
 * Two rules are worth the extra lines here:
 *
 * 1. **The URL must be `http(s)`.** A `javascript:` URL in a link staff can
 *    edit is a stored XSS hole, so the scheme is checked rather than assumed.
 * 2. **A PayPal entry must carry a parseable identifier.** Ticking "this is a
 *    PayPal link" and pasting a link with no `campaign_id` would otherwise
 *    render a form that posts nothing, and the person who finds out is a donor.
 *    Caught at save time, with a message that says what to paste.
 */
const httpUrl = z
	.string()
	.trim()
	.min(1, 'Required')
	.max(600)
	.refine((value) => /^https?:\/\//i.test(value), 'Must start with http:// or https://');

export const addSchema = z
	.object({
		slug: slugField,
		name: z.string().trim().min(1, 'Required').max(150),
		description: optionalText(600),
		companyName: z.string().trim().min(1, 'Required').max(80),
		companyLogo: optionalText(600),
		url: httpUrl,
		isPaypal: flagField(false),
		audience: z.enum(['anyone', 'diaspora', 'local']).default('anyone'),
		currency: z.string().trim().length(3).default('USD'),
		buttonLabel: optionalText(80),
		note: optionalText(300),
		isFeatured: flagField(false),
		isActive: flagField(true),
		sortOrder: sortOrderField
	})
	.refine((data) => !data.isPaypal || isUsablePaypalUrl(data.url), {
		message:
			'That PayPal link has no campaign id. Paste the full link PayPal gave you. It looks like https://www.paypal.com/donate?campaign_id=XXXXXXXX',
		path: ['url']
	});

export const editSchema = z
	.object({
		id: z.coerce.number(),
		slug: slugField,
		name: z.string().trim().min(1, 'Required').max(150),
		description: optionalText(600),
		companyName: z.string().trim().min(1, 'Required').max(80),
		companyLogo: optionalText(600),
		url: httpUrl,
		isPaypal: flagField(false),
		audience: z.enum(['anyone', 'diaspora', 'local']).default('anyone'),
		currency: z.string().trim().length(3).default('USD'),
		buttonLabel: optionalText(80),
		note: optionalText(300),
		isFeatured: flagField(false),
		isActive: flagField(true),
		sortOrder: sortOrderField
	})
	.refine((data) => !data.isPaypal || isUsablePaypalUrl(data.url), {
		message:
			'That PayPal link has no campaign id. Paste the full link PayPal gave you. It looks like https://www.paypal.com/donate?campaign_id=XXXXXXXX',
		path: ['url']
	});
