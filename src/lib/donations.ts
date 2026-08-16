/**
 * PayPal donate links, parsed rather than pasted.
 *
 * PayPal hands an organisation two things: a snippet of HTML to paste into a
 * page, and a link to share. Both carry exactly one piece of information that
 * is specific to the organisation — a campaign or hosted-button identifier —
 * and everything else is boilerplate.
 *
 * So staff paste the *link*, and this module lifts the identifier out of it.
 * The form is then ours: our markup, our button, our typography, our theme.
 * That means nobody is asked to paste HTML into a database field (where a
 * stray `<script>` would be a real problem), the button matches the rest of
 * the site instead of being a 1990s GIF, and changing the campaign is one URL
 * edit in the dashboard.
 */

/** Where a PayPal donate form posts. */
export const PAYPAL_ACTION = 'https://www.paypal.com/donate';

/**
 * The query parameters PayPal uses to identify a donation target, in the order
 * we prefer them. `campaign_id` is what the current donate-button builder
 * produces; `hosted_button_id` is the older hosted-button flow, and plenty of
 * organisations are still on a link that uses it.
 */
const ID_PARAMS = ['campaign_id', 'hosted_button_id', 'business'] as const;

export type PaypalParam = (typeof ID_PARAMS)[number];

export interface PaypalTarget {
	/** The hidden input's name, e.g. `campaign_id`. */
	param: PaypalParam;
	/** The hidden input's value — the only part that differs per organisation. */
	value: string;
}

/**
 * Pulls the donation identifier out of a PayPal link.
 *
 * Returns `null` when the link carries none, which is how the dashboard tells
 * a staff member they have pasted the wrong URL *before* it reaches a donor.
 */
export function paypalTarget(url: string | null | undefined): PaypalTarget | null {
	if (!url) return null;

	let params: URLSearchParams;
	try {
		params = new URL(url).searchParams;
	} catch {
		// Someone pasted a bare query string or a malformed link.
		const query = String(url).split('?')[1];
		if (!query) return null;
		params = new URLSearchParams(query);
	}

	for (const param of ID_PARAMS) {
		const value = params.get(param)?.trim();
		// PayPal identifiers are alphanumeric. Anything else is either a mistake
		// or an attempt to smuggle markup into a hidden input, and both should
		// fail the same way — by not rendering a form at all.
		if (value && /^[A-Za-z0-9@._-]{4,64}$/.test(value)) return { param, value };
	}

	return null;
}

/** Whether a link can actually drive a PayPal form. Used by the save-time check. */
export const isUsablePaypalUrl = (url: string | null | undefined): boolean =>
	paypalTarget(url) !== null;
