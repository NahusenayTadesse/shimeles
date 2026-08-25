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
	| 'memoriam'
	| 'gallery'
	| 'video'
	| 'testimonial_slider';

export interface RenderBlock {
	id: number;
	type: BlockType;
	heading: string | null;
	/** Shape depends on `type` — see the per-type contracts in `$lib/content/blocks`. */
	content: Record<string, unknown>;
	/**
	 * Photographs and videos attached to this block, for the `gallery` and
	 * `video` types. Loaded alongside the block rather than stored in
	 * `content`, because they are rows in `media_items` and are managed on the
	 * shared media screen.
	 */
	media?: {
		gallery: { id: number; storagePath: string; caption: string | null }[];
		videos: { id: number; youtubeUrl: string; caption: string | null }[];
	};
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

/* ==========================================================================
   Blog
   ========================================================================== */

export interface RenderBlogCategory {
	id: number;
	slug: string;
	name: string;
	description: string | null;
	/** Theme accent token: `clay`, `olive`, `plum`, `sky`. */
	color: string;
}

/** A post as a card in the `/blog` list — no body, so the list stays light. */
export interface RenderBlogPost {
	id: number;
	slug: string;
	title: string;
	excerpt: string | null;
	coverImage: string | null;
	authorName: string | null;
	/** Already resolved: the stored value, or an estimate from the body. */
	readMinutes: number;
	isFeatured: boolean;
	/** Epoch milliseconds. Never null on a post that reached the public list. */
	publishedAt: number | null;
	category: Pick<RenderBlogCategory, 'slug' | 'name' | 'color'> | null;
}

/** One post's full page: the rich-text body and its photo gallery. */
export interface RenderBlogPostDetail extends Omit<RenderBlogPost, 'publishedAt'> {
	body: string | null;
	metaDescription: string | null;
	publishedAt: number;
	/** Last edit, for `dateModified`. Equal to `publishedAt` on an untouched post. */
	updatedAt: number;
	gallery: { id: number; storagePath: string; caption: string | null }[];
	/**
	 * Pasted YouTube links, exactly as staff entered them. The video id is
	 * lifted out at render time by `$lib/youtube` — an unparseable link renders
	 * nothing rather than an empty player.
	 */
	videos: { id: number; youtubeUrl: string; caption: string | null }[];
}

/* ==========================================================================
   Testimonials
   ========================================================================== */

export interface RenderTestimonial {
	id: number;
	slug: string;
	name: string;
	/** "Parent, Kolfe" — context rather than a job title. */
	role: string | null;
	/** The pull quote. What the slider and the cards show. */
	quote: string;
	/** The longer story, as HTML from the dashboard editor. Often absent. */
	body: string | null;
	photo: string | null;
	pillar: { slug: string; name: string; color: string } | null;
}
