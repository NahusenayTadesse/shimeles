/**
 * The wire shapes the public site renders.
 *
 * Declared outside `$lib/server` so components can import them without
 * pulling server-only code into the browser bundle. Every string here is
 * already language-resolved — a component never picks between `x` and `xAm`.
 */

export type BlockType =
	| 'rich_text'
	| 'image'
	| 'stat_counter'
	| 'quote'
	| 'cta_button'
	| 'pillar_grid'
	| 'values_list'
	| 'initiative_grid'
	| 'form_embed'
	| 'donation_details'
	| 'memoriam';

export interface RenderBlock {
	id: number;
	type: BlockType;
	heading: string | null;
	/** Shape depends on `type` — see the per-type contracts in `$lib/content/blocks`. */
	content: Record<string, unknown>;
}

export interface RenderPage {
	id: number;
	slug: string;
	title: string;
	metaDescription: string | null;
	shareImage: string | null;
	blocks: RenderBlock[];
}

export interface RenderNavItem {
	id: number;
	label: string;
	href: string;
	isCta: boolean;
	children: RenderNavItem[];
}

export interface RenderPillar {
	id: number;
	slug: string;
	name: string;
	summary: string | null;
	description: string | null;
	icon: string;
	color: string;
	image: string | null;
	hasPublicApplication: boolean;
}

/** An external giving platform, resolved for rendering. */
export interface RenderDonationCampaign {
	id: number;
	slug: string;
	name: string;
	description: string | null;
	companyName: string;
	companyLogo: string | null;
	url: string;
	audience: 'anyone' | 'diaspora' | 'local';
	currency: string;
	buttonLabel: string | null;
	note: string | null;
	isFeatured: boolean;
	/**
	 * Set only when this is a PayPal link *and* an identifier could be parsed
	 * out of it. Its presence is what decides between rendering PayPal's form
	 * and rendering a plain link — a PayPal link we cannot parse degrades to a
	 * link rather than to a broken form.
	 */
	paypal: { param: string; value: string } | null;
}

export interface RenderInitiative {
	id: number;
	slug: string;
	name: string;
	description: string | null;
	icon: string;
	image: string | null;
	status: 'planned' | 'in_development' | 'active';
	goalAmount: number | null;
	currency: string;
}
