import { relations } from 'drizzle-orm';
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { secureFields, publicFields, timestampMs, nowMs, user } from './auth.schema';

export * from './auth.schema';

/* ==========================================================================
   How to read this schema
   ==========================================================================

   Three conventions run through every table below.

   1. **Money is an integer in the currency's minor unit.** SQLite has no
      DECIMAL — a `decimal(12,2)` column silently becomes a float, and floats
      lose cents. Every `amount` here is santim for ETB (100 santim = 1 birr)
      or cents for USD, alongside an explicit `currency`. Format at the edges
      with `formatMoney` in `$lib/money`, never by dividing in a template.

   2. **Timestamps are epoch milliseconds** (see `timestampMs`), so they sort
      and range-scan as integers.

   3. **English only, for now.** v1 ships English-only, but the `*_am` columns
      and the `preferred_language` / `language` columns are kept throughout —
      §1 requires somewhere to put Amharic, and leaving the columns in place
      makes restoring it a rendering change rather than a migration. Nothing
      reads them today.

   4. **Configuration is data, not code.** Per §0 of the technical spec,
      anything a program manager might want to change next year — pillar names,
      page copy, form questions, workflow status labels, navigation, regions —
      is a row somewhere below rather than a literal in a `.svelte` file. The
      handful of things that are deliberately fixed (a status's `stage`, a
      role's permission set) are marked as such where they appear.

   Indexes are declared rather than left to chance: SQLite will happily table
   scan `form_submissions` forever, and the case list filters by pillar, status
   and region on every load.
*/

/** Every table stores `region_id`; this is the editable list behind it. */
export const regions = sqliteTable('regions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull(),
	nameAm: text('name_am'),
	/** v1 ships with Addis Ababa alone; expansion is a dashboard row, not a migration. */
	isDefault: integer('is_default', { mode: 'boolean' }).default(false).notNull(),
	sortOrder: integer('sort_order').default(0).notNull(),
	...secureFields
});

/* ==========================================================================
   3.1 CONFIGURATION & CONTENT — the "everything editable" layer
   ========================================================================== */

/**
 * Key-value store for every global singleton on the site: phone numbers,
 * social links, bank details, hero copy, impact-counter overrides.
 *
 * The dashboard renders one auto-generated form per `group`, driven entirely
 * by these rows — adding `social.linkedin` next year is a new row, never a
 * migration and never new UI code.
 */
export const siteSettings = sqliteTable(
	'site_settings',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		key: text('key').notNull().unique(),
		value: text('value'),
		/** Reserved for Amharic. Unread in v1 — see the note at the top of this file. */
		valueAm: text('value_am'),
		valueType: text('value_type', {
			enum: ['text', 'textarea', 'number', 'boolean', 'json', 'image', 'url']
		})
			.default('text')
			.notNull(),
		label: text('label').notNull(),
		/** Shown under the field in the settings form, so staff know what it affects. */
		hint: text('hint'),
		group: text('group').default('general').notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [index('site_settings_group_idx').on(table.group, table.sortOrder)]
);

/** One row per top-level public page. Nav order and SEO live here too. */
export const pages = sqliteTable(
	'pages',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		title: text('title').notNull(),
		titleAm: text('title_am'),
		metaDescription: text('meta_description'),
		metaDescriptionAm: text('meta_description_am'),
		/** OG/social share image; a bare filename served by `/files`. */
		shareImage: text('share_image'),
		isPublished: integer('is_published', { mode: 'boolean' }).default(true).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [index('pages_published_idx').on(table.isPublished, table.sortOrder)]
);

/**
 * The body of every page, as ordered independently-editable blocks. This is
 * what lets staff rewrite a paragraph without touching code, and it is why no
 * page template in `src/routes` contains prose.
 *
 * `content` is JSON whose shape depends on `blockType` — see `BlockContent` in
 * `$lib/blocks` for the per-type contract and the renderer that switches on it.
 */
export const contentBlocks = sqliteTable(
	'content_blocks',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		pageId: integer('page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'cascade' }),
		blockType: text('block_type', {
			enum: [
				'rich_text',
				'image',
				'stat_counter',
				'quote',
				'cta_button',
				'pillar_grid',
				'values_list',
				'initiative_grid',
				'form_embed',
				'donation_details',
				'memoriam',
				'gallery',
				'video',
				'testimonial_slider'
			]
		})
			.default('rich_text')
			.notNull(),
		/** Optional heading rendered above the block, in both languages. */
		heading: text('heading'),
		headingAm: text('heading_am'),
		sortOrder: integer('sort_order').default(0).notNull(),
		content: text('content', { mode: 'json' }).$type<Record<string, unknown>>(),
		isPublished: integer('is_published', { mode: 'boolean' }).default(true).notNull(),
		...secureFields
	},
	(table) => [index('content_blocks_page_idx').on(table.pageId, table.sortOrder)]
);

export const navigationItems = sqliteTable(
	'navigation_items',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		label: text('label').notNull(),
		labelAm: text('label_am'),
		/** Either an internal page or a raw URL/anchor — one of the two is set. */
		pageId: integer('page_id').references(() => pages.id, { onDelete: 'cascade' }),
		url: text('url'),
		/** `header`, `footer`, or both, so the footer is not a second hardcoded list. */
		placement: text('placement', { enum: ['header', 'footer', 'both'] })
			.default('header')
			.notNull(),
		/** Self-referential, so a nav item can be a dropdown child. */
		parentId: integer('parent_id'),
		/** Renders as a filled button rather than a link — the "Donate" treatment. */
		isCta: integer('is_cta', { mode: 'boolean' }).default(false).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		isVisible: integer('is_visible', { mode: 'boolean' }).default(true).notNull(),
		...secureFields
	},
	(table) => [index('navigation_items_placement_idx').on(table.placement, table.sortOrder)]
);

/**
 * Short UI strings that are not full content blocks — button labels, field
 * labels, status names, email subjects. Read through the cached `t(key)`
 * helper in `$lib/server/settings`, deliberately not a static JSON file, so
 * fixing a clumsy label is a dashboard edit rather than a deploy.
 *
 * The `am` column is retained and unread in v1.
 */
export const translations = sqliteTable(
	'translations',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		key: text('key').notNull().unique(),
		en: text('en').notNull(),
		am: text('am'),
		/** Namespace for the dashboard filter, e.g. `form`, `status`, `email`. */
		group: text('group').default('general').notNull(),
		...secureFields
	},
	(table) => [index('translations_group_idx').on(table.group)]
);

/* ==========================================================================
   3.2 PILLARS & PROGRAMS
   ========================================================================== */

/**
 * The four pillars are data, not an enum, so a fifth is a dashboard row.
 * Nothing in the codebase may branch on a pillar slug.
 */
export const pillars = sqliteTable(
	'pillars',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		nameAm: text('name_am'),
		/** One-line summary for cards and grids. */
		summary: text('summary'),
		summaryAm: text('summary_am'),
		description: text('description'),
		descriptionAm: text('description_am'),
		/** Lucide icon identifier, resolved at render time by `dynamic-icon`. */
		icon: text('icon').default('HeartHandshake').notNull(),
		/** Theme accent token: `clay`, `olive`, `plum`, `sky`. */
		color: text('color').default('clay').notNull(),
		image: text('image'),
		sortOrder: integer('sort_order').default(0).notNull(),
		hasPublicApplication: integer('has_public_application', { mode: 'boolean' })
			.default(true)
			.notNull(),
		...secureFields
	},
	(table) => [index('pillars_active_idx').on(table.isActive, table.sortOrder)]
);

/** The free hospital, the boarding schools, the senior centres. */
export const futureInitiatives = sqliteTable(
	'future_initiatives',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		nameAm: text('name_am'),
		description: text('description'),
		descriptionAm: text('description_am'),
		icon: text('icon').default('Building2').notNull(),
		image: text('image'),
		status: text('status', { enum: ['planned', 'in_development', 'active'] })
			.default('planned')
			.notNull(),
		/** Optional fundraising target, in minor units of `currency`. */
		goalAmount: integer('goal_amount'),
		currency: text('currency').default('ETB').notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [index('future_initiatives_status_idx').on(table.status, table.sortOrder)]
);

/** Which pillars a staff member may see. Enforced as a query scope, not a UI hide. */
export const userPillarAssignments = sqliteTable(
	'user_pillar_assignments',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		pillarId: integer('pillar_id')
			.notNull()
			.references(() => pillars.id, { onDelete: 'cascade' }),
		...secureFields
	},
	(table) => [
		uniqueIndex('user_pillar_unique').on(table.userId, table.pillarId),
		index('user_pillar_user_idx').on(table.userId)
	]
);

/* ==========================================================================
   3.9 STATUS OPTIONS — config-driven workflow states
   ========================================================================== */

/**
 * Workflow states modelled as data so their *labels, colours and order* are
 * dashboard-editable, while the underlying `stage` — which gates logic such as
 * the volunteer safeguarding rule — stays a fixed, code-level category.
 *
 * Records store `statusId`, never a raw string, so relabelling "Under review"
 * to "Being assessed" touches no data. Gating logic keys off `stage`, never
 * off `label`, so relabelling never breaks a workflow rule.
 */
export const statusOptions = sqliteTable(
	'status_options',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		context: text('context', { enum: ['application', 'volunteer', 'donation', 'contact'] })
			.default('application')
			.notNull(),
		/** Fixed in code — see §7. Editing this from the dashboard is disallowed. */
		stage: text('stage', {
			enum: [
				// applications
				'submitted',
				'under_review',
				'verified',
				'approved',
				'declined',
				'active',
				'closed',
				// volunteers
				'references_checked',
				'credentials_verified'
			]
		}).notNull(),
		label: text('label').notNull(),
		labelAm: text('label_am'),
		/** Badge colour token used by the dashboard tables and the kanban board. */
		color: text('color').default('slate').notNull(),
		/** Shown to the applicant if the status is ever surfaced publicly. */
		publicDescription: text('public_description'),
		publicDescriptionAm: text('public_description_am'),
		/** The status a brand-new record lands on, per context. */
		isDefault: integer('is_default', { mode: 'boolean' }).default(false).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [index('status_options_context_idx').on(table.context, table.sortOrder)]
);

/* ==========================================================================
   3.8 FILES & MEDIA
   ========================================================================== */

/**
 * Every upload, public media and private case document alike.
 *
 * `isPublic` is not a UI flag: `/files/[name]` refuses to serve a row with
 * `isPublic = false` to anyone without a session and the matching pillar
 * scope. A medical letter must not be readable by URL-guessing.
 */
export const files = sqliteTable(
	'files',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		originalFilename: text('original_filename').notNull(),
		/** The randomised on-disk name; also the `/files/:name` path segment. */
		storagePath: text('storage_path').notNull().unique(),
		mimeType: text('mime_type').notNull(),
		sizeBytes: integer('size_bytes').default(0).notNull(),
		isPublic: integer('is_public', { mode: 'boolean' }).default(false).notNull(),
		/** Set when a private file belongs to a pillar, for scoped access checks. */
		pillarId: integer('pillar_id').references(() => pillars.id, { onDelete: 'set null' }),
		uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestampMs('created_at').default(nowMs).notNull(),
		deletedAt: timestampMs('deleted_at')
	},
	(table) => [
		index('files_public_idx').on(table.isPublic),
		index('files_pillar_idx').on(table.pillarId)
	]
);

/* ==========================================================================
   ABOUT PAGE

   Unlike every other public page, About is not assembled from
   `content_blocks` — it is big enough, and fixed enough in shape (a story, a
   mission, a vision, an In Memoriam tribute, the initiatives grid), that it
   is a hand-built route (`/about`) instead. These two tables hold the parts
   of it a program manager still needs to rewrite without a deploy: the copy,
   the two hero photographs, and the memorial photo gallery. The section
   order, icons and layout are code, not data.
   ========================================================================== */

/**
 * A single row (id 1). Not modelled as `site_settings` rows because every
 * field here is a paragraph or an image, not a short value a generic settings
 * form handles well — this gets its own screen instead (§ dashboard/about).
 */
export const aboutContent = sqliteTable('about_content', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	metaDescription: text('meta_description'),
	/** Top-of-page banner photo. */
	heroImage: text('hero_image'),
	/** "Our Story" — rich text from the dashboard editor. */
	storyBody: text('story_body'),
	/** Plain paragraphs, not rich text — kept short and singular by design. */
	missionText: text('mission_text'),
	visionText: text('vision_text'),
	memoriamName: text('memoriam_name').default('Shimeles Abera').notNull(),
	/** The large, prominent In Memoriam photograph — not the small avatar the
	 *  generic `memoriam` content block uses elsewhere on the site. */
	memoriamHeroImage: text('memoriam_hero_image'),
	memoriamBody: text('memoriam_body'),
	updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
	updatedAt: timestampMs('updated_at').default(nowMs).notNull()
});

/* ==========================================================================
   BLOG

   The Foundation's own writing: programme updates, field notes, donor
   stories. Three tables rather than one because a post has a category a
   staff member should be able to add without a deploy (§0), and because the
   photographs from a distribution day are a set, not a single cover image.
   ========================================================================== */

/**
 * The editable list behind the blog's filter chips. A new category is a
 * dashboard row, never a code branch — the public `/blog` page builds its
 * filters from whatever is here.
 */
export const blogCategories = sqliteTable(
	'blog_categories',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		nameAm: text('name_am'),
		description: text('description'),
		/** Theme accent token, same vocabulary as `pillars.color`. */
		color: text('color').default('olive').notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [index('blog_categories_active_idx').on(table.isActive, table.sortOrder)]
);

/**
 * One article.
 *
 * `body` is HTML from the dashboard's rich-text editor and renders through
 * `.prose-block`, exactly like `pillars.description` — staff author the whole
 * article, so there is no block model here.
 *
 * Publication is `publishedAt` plus `isPublished`, not a status enum: the
 * public list filters on "published, and the date has passed", which is what
 * makes scheduling a post for Monday possible without a second mechanism.
 */
export const blogPosts = sqliteTable(
	'blog_posts',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		title: text('title').notNull(),
		titleAm: text('title_am'),
		/** One paragraph for cards, search results and the share preview. */
		excerpt: text('excerpt'),
		excerptAm: text('excerpt_am'),
		/** Rich text from the dashboard editor. */
		body: text('body'),
		bodyAm: text('body_am'),
		/** A bare filename served by `/files`, like every other image column. */
		coverImage: text('cover_image'),
		categoryId: integer('category_id').references(() => blogCategories.id, {
			onDelete: 'set null'
		}),
		/** Free text, so a guest writer needs no staff account to be credited. */
		authorName: text('author_name'),
		metaDescription: text('meta_description'),
		/** Drives the "N min read" line; 0 means "work it out from the body". */
		readMinutes: integer('read_minutes').default(0).notNull(),
		isFeatured: integer('is_featured', { mode: 'boolean' }).default(false).notNull(),
		isPublished: integer('is_published', { mode: 'boolean' }).default(true).notNull(),
		/** Null means "not scheduled"; the public list treats that as a draft. */
		publishedAt: timestampMs('published_at'),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [
		index('blog_posts_published_idx').on(table.isPublished, table.publishedAt),
		index('blog_posts_category_idx').on(table.categoryId)
	]
);

/* ==========================================================================
   MEDIA

   One table for every photo gallery and every video on the site.

   This started as four near-identical gallery tables — About, the homepage
   hero, the homepage strip, and the blog — which is three copies too many.
   They had already drifted: three keyed their image by `files.id`, the fourth
   stored the path. That drift appeared on the very first copy after the
   pattern was set, which is the argument for stopping.

   So media is keyed by *what owns it* rather than by a column per owner.
   Adding a gallery to the next entity is a new `owner_type` value and no
   migration at all.

   The cost, stated plainly: SQLite cannot foreign-key one column at several
   parent tables, so `owner_id` carries no referential integrity and cascade
   deletes are application code — `deleteMediaFor()` in `$lib/server/media`,
   which every owner's delete path calls. That is a real guarantee given up.
   It buys one upload component, one set of server actions and one query for
   nine kinds of owner, which at this number of owners is the better trade.
   ========================================================================== */

/**
 * What a media item can hang off.
 *
 * `hero` and `homepage` are site-level collections with no row of their own —
 * they carry `owner_id` 0. Everything else names a real row's id.
 */
export const MEDIA_OWNERS = [
	'about',
	'hero',
	'homepage',
	'blog_post',
	'pillar',
	'initiative',
	'campaign',
	'testimonial',
	'content_block'
] as const;

export type MediaOwner = (typeof MEDIA_OWNERS)[number];

export const mediaItems = sqliteTable(
	'media_items',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		ownerType: text('owner_type', { enum: MEDIA_OWNERS }).notNull(),
		/** 0 for the site-level collections; a row id for everything else. */
		ownerId: integer('owner_id').default(0).notNull(),
		kind: text('kind', { enum: ['image', 'video'] }).notNull(),
		/**
		 * What to render.
		 *
		 * For an image: the bare filename `/files` serves, like every other image
		 * column in this schema. For a video: the YouTube link exactly as a staff
		 * member pasted it, parsed back into a player by `$lib/youtube`.
		 */
		url: text('url').notNull(),
		/**
		 * The `files` row behind an uploaded image, so deleting the item can also
		 * delete the bytes. Null for videos, and for images that predate the
		 * upload path or were seeded from files already on disk.
		 */
		fileId: integer('file_id').references(() => files.id, { onDelete: 'set null' }),
		caption: text('caption'),
		sortOrder: integer('sort_order').default(0).notNull(),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestampMs('created_at').default(nowMs).notNull()
	},
	(table) => [
		index('media_owner_idx').on(table.ownerType, table.ownerId, table.sortOrder),
		index('media_file_idx').on(table.fileId)
	]
);

/* ==========================================================================
   TESTIMONIALS
   ========================================================================== */

/**
 * What the people the Foundation works with say about it.
 *
 * Two independent flags, because they answer two different questions and a
 * single "featured" would conflate them:
 *
 *  - `showOnSite` puts it on `/testimonials`, the full wall.
 *  - `isFeatured` puts it in the homepage slider, which holds a handful.
 *
 * A quote can be on the wall without being on the front page, which is the
 * common case, and the front page's selection can be changed without hiding
 * anything from the wall.
 */
export const testimonials = sqliteTable(
	'testimonials',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		/** Who said it. A first name alone is fine, and often the right choice. */
		name: text('name').notNull(),
		nameAm: text('name_am'),
		/** "Parent, Kolfe" — context, not a job title. */
		role: text('role'),
		roleAm: text('role_am'),
		/** The pull quote. Short; this is what the slider shows. */
		quote: text('quote').notNull(),
		quoteAm: text('quote_am'),
		/** The longer story, rich text from the dashboard editor. Optional. */
		body: text('body'),
		bodyAm: text('body_am'),
		photo: text('photo'),
		/** Which programme this speaks to, for filtering the wall. */
		pillarId: integer('pillar_id').references(() => pillars.id, { onDelete: 'set null' }),
		/** Shown on `/testimonials`. */
		showOnSite: integer('show_on_site', { mode: 'boolean' }).default(true).notNull(),
		/** Shown in the homepage slider. */
		isFeatured: integer('is_featured', { mode: 'boolean' }).default(false).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [
		index('testimonials_site_idx').on(table.showOnSite, table.sortOrder),
		index('testimonials_featured_idx').on(table.isFeatured, table.sortOrder),
		index('testimonials_pillar_idx').on(table.pillarId)
	]
);

/* ==========================================================================
   3.3 DYNAMIC FORMS
   ========================================================================== */

/**
 * One row per public form: the four pillar applications, the volunteer form,
 * the contact form, and anything staff add later. There is exactly one form
 * renderer and one Zod schema generator (`$lib/server/forms`) reading these
 * rows — there is no per-pillar Svelte form component anywhere in this repo.
 */
export const formDefinitions = sqliteTable(
	'form_definitions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		/** Internal label for the dashboard list. */
		name: text('name').notNull(),
		pillarId: integer('pillar_id').references(() => pillars.id, { onDelete: 'set null' }),
		title: text('title').notNull(),
		titleAm: text('title_am'),
		introText: text('intro_text'),
		introTextAm: text('intro_text_am'),
		/** Shown after a successful submission, alongside the reference number. */
		successMessage: text('success_message'),
		successMessageAm: text('success_message_am'),
		requiresDocuments: integer('requires_documents', { mode: 'boolean' }).default(false).notNull(),
		/**
		 * Mental Wellness and anything like it. When true the schema generator
		 * refuses to mark contact details or document uploads as required, so a
		 * "low barrier" promise cannot be quietly broken by adding a field.
		 */
		isLowBarrier: integer('is_low_barrier', { mode: 'boolean' }).default(false).notNull(),
		/** Prefix for generated reference numbers, e.g. `MED` → `SAF-MED-2026-0142`. */
		referencePrefix: text('reference_prefix').default('GEN').notNull(),
		/** Which status list a submission against this form moves through. */
		statusContext: text('status_context', { enum: ['application', 'volunteer'] })
			.default('application')
			.notNull(),
		/** Notification recipients for new submissions, one email per array entry. */
		notifyEmails: text('notify_emails', { mode: 'json' }).$type<string[]>(),
		isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
		updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
		createdAt: timestampMs('created_at').default(nowMs).notNull(),
		updatedAt: timestampMs('updated_at').default(nowMs).notNull(),
		deletedAt: timestampMs('deleted_at')
	},
	(table) => [index('form_definitions_pillar_idx').on(table.pillarId)]
);

/**
 * The questions on a form. `validation` is handed to the Zod schema builder,
 * so a program manager tightening "describe your situation" from 50 to 200
 * characters is a dashboard edit that takes effect on the next request.
 */
export const formFields = sqliteTable(
	'form_fields',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		formDefinitionId: integer('form_definition_id')
			.notNull()
			.references(() => formDefinitions.id, { onDelete: 'cascade' }),
		/** Stable key used for the `form_submissions.data` JSON. Never reuse one. */
		fieldKey: text('field_key').notNull(),
		label: text('label').notNull(),
		labelAm: text('label_am'),
		/** Helper text under the input. */
		hint: text('hint'),
		hintAm: text('hint_am'),
		placeholder: text('placeholder'),
		fieldType: text('field_type', {
			enum: [
				'text',
				'textarea',
				'number',
				'date',
				'select',
				'multiselect',
				'checkbox',
				'file_upload',
				'phone',
				'email',
				'heading'
			]
		})
			.default('text')
			.notNull(),
		/** `[{ value, label }]` for select/multiselect. */
		options: text('options', { mode: 'json' }).$type<{ value: string; label: string }[]>(),
		isRequired: integer('is_required', { mode: 'boolean' }).default(false).notNull(),
		/** `{ min, max, minLength, maxLength, pattern }`, all optional. */
		validation: text('validation', { mode: 'json' }).$type<Record<string, unknown>>(),
		/** Show this field only when another field has a given value. */
		showWhenFieldKey: text('show_when_field_key'),
		showWhenValue: text('show_when_value'),
		/**
		 * Copies the answer onto the submission's own column as well as the JSON
		 * blob — how a free-text "your name" question becomes `submittedByName`
		 * without hardcoding which question that is.
		 */
		mapsTo: text('maps_to', { enum: ['name', 'phone', 'email', 'region'] }),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [
		uniqueIndex('form_fields_key_unique').on(table.formDefinitionId, table.fieldKey),
		index('form_fields_form_idx').on(table.formDefinitionId, table.sortOrder)
	]
);

/**
 * Every public submission — assistance applications and contact messages
 * alike. The contact form is a `form_definitions` row like any other rather
 * than a second bespoke table, per §3.7.
 */
export const formSubmissions = sqliteTable(
	'form_submissions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		formDefinitionId: integer('form_definition_id')
			.notNull()
			.references(() => formDefinitions.id, { onDelete: 'restrict' }),
		/** Human-readable and quotable on the phone, e.g. `SAF-MED-2026-0142`. */
		referenceNumber: text('reference_number').notNull().unique(),
		/** Answers keyed by `form_fields.field_key`. */
		data: text('data', { mode: 'json' }).$type<Record<string, unknown>>(),
		statusId: integer('status_id').references(() => statusOptions.id, { onDelete: 'set null' }),
		/**
		 * Denormalised from the form definition so the case list can filter by
		 * pillar without a join — and so a submission keeps its pillar even if the
		 * form is later repointed.
		 */
		pillarId: integer('pillar_id').references(() => pillars.id, { onDelete: 'set null' }),
		submittedByBeneficiaryId: integer('submitted_by_beneficiary_id').references(
			() => beneficiaries.id,
			{ onDelete: 'set null' }
		),
		/** Kept even when a low-barrier form leaves them blank. */
		submittedByName: text('submitted_by_name'),
		submittedByPhone: text('submitted_by_phone'),
		submittedByEmail: text('submitted_by_email'),
		assignedReviewerId: text('assigned_reviewer_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		regionId: integer('region_id').references(() => regions.id, { onDelete: 'set null' }),
		/** Language the applicant filled the form in, so replies match. */
		language: text('language', { enum: ['en', 'am'] })
			.default('en')
			.notNull(),
		/** Staff triage flag, independent of workflow stage. */
		priority: text('priority', { enum: ['low', 'normal', 'high', 'urgent'] })
			.default('normal')
			.notNull(),
		/** Unread badge in the dashboard; not part of the workflow. */
		isRead: integer('is_read', { mode: 'boolean' }).default(false).notNull(),
		closedAt: timestampMs('closed_at'),
		...publicFields
	},
	(table) => [
		// The case list's default view: one pillar, one status, newest first.
		index('form_submissions_pillar_status_idx').on(table.pillarId, table.statusId, table.createdAt),
		index('form_submissions_form_idx').on(table.formDefinitionId, table.createdAt),
		index('form_submissions_reviewer_idx').on(table.assignedReviewerId),
		index('form_submissions_beneficiary_idx').on(table.submittedByBeneficiaryId),
		index('form_submissions_region_idx').on(table.regionId),
		// Duplicate-detection and "have they applied before" lookups.
		index('form_submissions_phone_idx').on(table.submittedByPhone)
	]
);

export const formSubmissionDocuments = sqliteTable(
	'form_submission_documents',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		formSubmissionId: integer('form_submission_id')
			.notNull()
			.references(() => formSubmissions.id, { onDelete: 'cascade' }),
		fileId: integer('file_id')
			.notNull()
			.references(() => files.id, { onDelete: 'cascade' }),
		/** e.g. "Medical letter", "Income evidence". */
		label: text('label'),
		/** Which question produced it, when the upload came from the public form. */
		fieldKey: text('field_key'),
		...publicFields
	},
	(table) => [index('submission_documents_submission_idx').on(table.formSubmissionId)]
);

/** Internal case notes. Never rendered on a public route. */
export const formSubmissionNotes = sqliteTable(
	'form_submission_notes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		formSubmissionId: integer('form_submission_id')
			.notNull()
			.references(() => formSubmissions.id, { onDelete: 'cascade' }),
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		note: text('note').notNull(),
		/** System-written notes (status changes) versus staff-written ones. */
		isSystem: integer('is_system', { mode: 'boolean' }).default(false).notNull(),
		createdAt: timestampMs('created_at').default(nowMs).notNull(),
		deletedAt: timestampMs('deleted_at')
	},
	(table) => [index('submission_notes_submission_idx').on(table.formSubmissionId, table.createdAt)]
);

/* ==========================================================================
   3.3b ASSISTANCE APPLICATIONS — the structure around a case

   `/apply` is a real route with fixed questions, the same call as `/volunteer`
   and `/contact`. What is *not* duplicated is the case itself: an application
   is still a `form_submissions` row, because that is where pillar scope, case
   notes, documents, disbursements and the audited reads already live, and a
   fourth parallel case table would fracture all of it.

   What was missing is the shape of the answers, and it is added here:

    - **Who is being helped.** Most applications are made on someone else's
      behalf — by a daughter for her mother, by a neighbour. The applicant and
      the person in need are two different people and the system has to hold
      both, because the beneficiary record must be the person helped.
    - **What they need.** A catalogue rather than a paragraph, so "how many
      families need school fees this term" is a `where` clause.
    - **What language they wrote in.** §1 is Addis-first but Ethiopia is not
      monolingual, and an applicant told to write in whatever language they are
      comfortable in must not then land with a caseworker who cannot read it.
   ========================================================================== */

/**
 * The languages an applicant may write in.
 *
 * A row rather than an enum because the list is a programme decision: the
 * Foundation expanding into a region where people write Sidamo should be an
 * edit here (§0). Note this is *not* the site's UI language — v1 renders in
 * English only. This is what the applicant's own words are written in, so the
 * case reaches somebody who can read them.
 */
export const languages = sqliteTable(
	'languages',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		/** English name, for staff screens. */
		name: text('name').notNull(),
		/** The language's own name, shown to the applicant choosing it. */
		nativeName: text('native_name'),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [index('languages_active_idx').on(table.isActive, table.sortOrder)]
);

/** Groups the needs list on the public form. Presentation only. */
export const assistanceNeedCategories = sqliteTable(
	'assistance_need_categories',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		nameAm: text('name_am'),
		description: text('description'),
		icon: text('icon'),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [index('assistance_need_categories_active_idx').on(table.isActive, table.sortOrder)]
);

/**
 * The kinds of help someone can ask for.
 *
 * Tied to a pillar where the mapping is clean, so choosing "school fees"
 * routes the case to Youth Education without the applicant having to know the
 * Foundation's internal structure. A need with no pillar shows under every
 * programme.
 */
export const assistanceNeeds = sqliteTable(
	'assistance_needs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		nameAm: text('name_am'),
		description: text('description'),
		categoryId: integer('category_id').references(() => assistanceNeedCategories.id, {
			onDelete: 'set null'
		}),
		/** Which programme this routes to. Null shows it under all of them. */
		pillarId: integer('pillar_id').references(() => pillars.id, { onDelete: 'set null' }),
		/** Shown on the form as a heads-up, never enforced — see the note on documents. */
		evidenceHint: text('evidence_hint'),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [
		index('assistance_needs_pillar_idx').on(table.pillarId, table.sortOrder),
		index('assistance_needs_active_idx').on(table.isActive, table.sortOrder)
	]
);

/**
 * The person an application is about, and the circumstances around them.
 *
 * One row per submission. Split out rather than added as twenty columns on
 * `form_submissions` because it is specific to assistance applications, while
 * that table also carries the legacy contact messages and anything a staff
 * member builds in the form builder next year.
 *
 * Almost every column is nullable on purpose. §3.3 makes Mental Wellness a
 * low-barrier form where an applicant may withhold everything, and a schema
 * that insists on a date of birth is a schema that turns someone away.
 */
export const applicationSubjects = sqliteTable(
	'application_subjects',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		formSubmissionId: integer('form_submission_id')
			.notNull()
			.references(() => formSubmissions.id, { onDelete: 'cascade' }),

		/**
		 * `self` means the applicant *is* the person in need, and the subject
		 * columns below repeat their details rather than being left empty — so
		 * "who is being helped" is one place to look either way.
		 */
		applyingFor: text('applying_for', { enum: ['self', 'other'] })
			.default('self')
			.notNull(),
		/** How the applicant knows them: daughter, neighbour, teacher, social worker. */
		relationship: text('relationship'),

		fullName: text('full_name'),
		dateOfBirth: text('date_of_birth'),
		/** Used when a birth date is unknown, which is common. */
		approximateAge: integer('approximate_age'),
		gender: text('gender', { enum: ['female', 'male', 'other', 'undisclosed'] })
			.default('undisclosed')
			.notNull(),
		phone: text('phone'),
		city: text('city'),
		addressLine: text('address_line'),
		regionId: integer('region_id').references(() => regions.id, { onDelete: 'set null' }),

		/* --- Circumstances, for triage ------------------------------------- */

		householdSize: integer('household_size'),
		dependantsCount: integer('dependants_count'),
		/** Minor units, like every other money column here. Santim for ETB. */
		monthlyIncome: integer('monthly_income'),
		incomeSource: text('income_source'),
		isEmployed: integer('is_employed', { mode: 'boolean' }),
		hasDisability: integer('has_disability', { mode: 'boolean' }),
		/** Only meaningful when `hasDisability` or a health need is claimed. */
		healthDetail: text('health_detail'),
		/** Receiving help from elsewhere; asked so support is not duplicated. */
		otherSupport: text('other_support'),

		/* --- Reaching them safely -------------------------------------------
		   `safeToContact` is not politeness. Someone applying about a mental
		   health crisis or a family situation may not be safe to ring at home,
		   and a caseworker needs to know before they dial. */

		safeToContact: integer('safe_to_contact', { mode: 'boolean' }).default(true).notNull(),
		contactNotes: text('contact_notes'),
		bestTimeToContact: text('best_time_to_contact'),
		alternateContactName: text('alternate_contact_name'),
		alternateContactPhone: text('alternate_contact_phone'),

		/** What the applicant's own words are written in — see `languages`. */
		writtenLanguageId: integer('written_language_id').references(() => languages.id, {
			onDelete: 'set null'
		}),

		/**
		 * Stamped from the server clock when the applicant agreed, rather than
		 * stored as a boolean: "when did they consent to us verifying this" is a
		 * question a `true` cannot answer.
		 */
		consentToVerifyAt: timestampMs('consent_to_verify_at'),
		consentToStoreAt: timestampMs('consent_to_store_at'),

		...publicFields
	},
	(table) => [
		// One subject per application. Both sides NOT NULL, so this constrains.
		uniqueIndex('application_subject_unique').on(table.formSubmissionId),
		index('application_subjects_name_idx').on(table.fullName),
		index('application_subjects_phone_idx').on(table.phone)
	]
);

/** What one application is asking for. The queryable half of "what do you need". */
export const applicationNeeds = sqliteTable(
	'application_needs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		formSubmissionId: integer('form_submission_id')
			.notNull()
			.references(() => formSubmissions.id, { onDelete: 'cascade' }),
		needId: integer('need_id')
			.notNull()
			.references(() => assistanceNeeds.id, { onDelete: 'cascade' }),
		/** The applicant's own description of this particular need. */
		detail: text('detail'),
		/** Minor units. What they think it would cost; frequently blank. */
		estimatedAmount: integer('estimated_amount'),
		currency: text('currency').default('ETB').notNull(),
		urgency: text('urgency', { enum: ['whenever', 'weeks', 'days', 'immediate'] })
			.default('weeks')
			.notNull(),
		createdAt: timestampMs('created_at').default(nowMs).notNull()
	},
	(table) => [
		uniqueIndex('application_need_unique').on(table.formSubmissionId, table.needId),
		index('application_needs_need_idx').on(table.needId)
	]
);

/* ==========================================================================
   3.4 BENEFICIARIES & DISBURSEMENTS
   ========================================================================== */

export const households = sqliteTable(
	'households',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		label: text('label').notNull(),
		regionId: integer('region_id').references(() => regions.id, { onDelete: 'set null' }),
		notes: text('notes'),
		...secureFields
	},
	(table) => [index('households_region_idx').on(table.regionId)]
);

/**
 * One record per person or household, so a returning family is recognised
 * rather than re-entered — the Foundation's continuity-of-care requirement.
 */
export const beneficiaries = sqliteTable(
	'beneficiaries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		fullName: text('full_name').notNull(),
		/** Nullable throughout: Mental Wellness applicants may withhold everything. */
		phone: text('phone'),
		email: text('email'),
		householdId: integer('household_id').references(() => households.id, { onDelete: 'set null' }),
		regionId: integer('region_id').references(() => regions.id, { onDelete: 'set null' }),
		dateOfBirth: text('date_of_birth'),
		gender: text('gender', { enum: ['female', 'male', 'other', 'undisclosed'] })
			.default('undisclosed')
			.notNull(),
		preferredLanguage: text('preferred_language', { enum: ['en', 'am'] })
			.default('en')
			.notNull(),
		/**
		 * Supersedes `preferredLanguage`, which cannot express Afaan Oromo. Set
		 * when a beneficiary is created from an application, carrying over the
		 * language that application was written in.
		 */
		languageId: integer('language_id').references(() => languages.id, { onDelete: 'set null' }),
		/** Internal only. Read access is audited like everything else here. */
		notes: text('notes'),
		...secureFields
	},
	(table) => [
		index('beneficiaries_household_idx').on(table.householdId),
		index('beneficiaries_region_idx').on(table.regionId),
		index('beneficiaries_phone_idx').on(table.phone),
		index('beneficiaries_name_idx').on(table.fullName)
	]
);

/** The record that proves where a donation went, tied to a specific case. */
export const disbursements = sqliteTable(
	'disbursements',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		formSubmissionId: integer('form_submission_id').references(() => formSubmissions.id, {
			onDelete: 'set null'
		}),
		beneficiaryId: integer('beneficiary_id').references(() => beneficiaries.id, {
			onDelete: 'set null'
		}),
		pillarId: integer('pillar_id').references(() => pillars.id, { onDelete: 'set null' }),
		/** Minor units. See the money note at the top of this file. */
		amount: integer('amount').notNull(),
		currency: text('currency').default('ETB').notNull(),
		/** Hospital, school, supplier — who the money actually went to. */
		paidTo: text('paid_to').notNull(),
		disbursementDate: text('disbursement_date').notNull(),
		fundSource: text('fund_source', { enum: ['general_fund', 'designated'] })
			.default('general_fund')
			.notNull(),
		/** Set when `fundSource` is `designated`. */
		designationPillarId: integer('designation_pillar_id').references(() => pillars.id, {
			onDelete: 'set null'
		}),
		designationInitiativeId: integer('designation_initiative_id').references(
			() => futureInitiatives.id,
			{ onDelete: 'set null' }
		),
		receiptFileId: integer('receipt_file_id').references(() => files.id, { onDelete: 'set null' }),
		/** Free-text purpose. Finance sees amount and date but not this narrative. */
		narrative: text('narrative'),
		recordedBy: text('recorded_by').references(() => user.id, { onDelete: 'set null' }),
		...secureFields
	},
	(table) => [
		index('disbursements_submission_idx').on(table.formSubmissionId),
		index('disbursements_beneficiary_idx').on(table.beneficiaryId),
		index('disbursements_date_idx').on(table.disbursementDate),
		index('disbursements_pillar_idx').on(table.pillarId)
	]
);

/* ==========================================================================
   3.5 DONATIONS
   ========================================================================== */

/**
 * How money can reach the Foundation. Editable because CBE is not the only
 * bank and Telebirr is not the only wallet — adding one is a dashboard row.
 */
export const paymentMethods = sqliteTable(
	'payment_methods',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		nameAm: text('name_am'),
		/** Bank transfer and mobile money need reconciliation; card/PayPal do not. */
		kind: text('kind', { enum: ['bank_transfer', 'mobile_money', 'card', 'paypal', 'cash'] })
			.default('bank_transfer')
			.notNull(),
		logo: text('logo'),
		instructions: text('instructions'),
		instructionsAm: text('instructions_am'),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [index('payment_methods_active_idx').on(table.isActive, table.sortOrder)]
);

/** The actual account numbers shown to a donor on the Donate page. */
export const paymentAccounts = sqliteTable(
	'payment_accounts',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		paymentMethodId: integer('payment_method_id')
			.notNull()
			.references(() => paymentMethods.id, { onDelete: 'cascade' }),
		accountName: text('account_name').notNull(),
		accountNumber: text('account_number').notNull(),
		bankName: text('bank_name'),
		branch: text('branch'),
		swiftCode: text('swift_code'),
		currency: text('currency').default('ETB').notNull(),
		/** Diaspora donors need the USD/SWIFT account, local donors the ETB one. */
		isForDiaspora: integer('is_for_diaspora', { mode: 'boolean' }).default(false).notNull(),
		instructions: text('instructions'),
		instructionsAm: text('instructions_am'),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [index('payment_accounts_method_idx').on(table.paymentMethodId, table.sortOrder)]
);

/**
 * Donation links for payment platforms we do not process ourselves — PayPal,
 * Zeffy, and whatever comes next.
 *
 * **What this table is not:** a record of money. A gift given through one of
 * these links is collected by the platform and never touches `donations`, so it
 * does not appear in the reconciliation queue and does not move the public
 * "funds raised" counter. Finance reconciles these from the platform's own
 * reports. The dashboard screen says so plainly, because a staff member who
 * assumed otherwise would under-report the Foundation's income.
 *
 * **Why the PayPal id is not its own column.** PayPal gives you a form to paste
 * and a link to share, and the only thing that differs between two Foundations
 * using it is one identifier. Staff paste the link they were given; the
 * `campaign_id` is parsed out of it at render time by `paypalTarget()` in
 * `$lib/donations.ts`, and the form around it is ours — our markup, our button,
 * our type. One source of truth, and nobody has to paste HTML into a database.
 */
export const donationCampaigns = sqliteTable(
	'donation_campaigns',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		/** What the Foundation calls this appeal, e.g. "Donate to change lives". */
		name: text('name').notNull(),
		description: text('description'),
		/** The platform: "PayPal", "Zeffy". Shown next to the button. */
		companyName: text('company_name').notNull(),
		/**
		 * A bare filename served by `/files`, or an absolute URL — `assetUrl`
		 * accepts both, so a platform's own hosted logo works without an upload.
		 */
		companyLogo: text('company_logo'),
		/** The link exactly as the platform gave it. Parsed, never hand-edited. */
		url: text('url').notNull(),
		/**
		 * Renders PayPal's own donate form (posting `campaign_id`) rather than a
		 * plain link, so the donor lands on a pre-filled PayPal checkout.
		 */
		isPaypal: integer('is_paypal', { mode: 'boolean' }).default(false).notNull(),
		/**
		 * Who this option suits. Card platforms mostly serve diaspora donors,
		 * while a local donor wants the bank transfer — labelling it saves
		 * somebody in Addis Ababa from being sent to a USD checkout.
		 */
		audience: text('audience', { enum: ['anyone', 'diaspora', 'local'] })
			.default('anyone')
			.notNull(),
		/** Currency the platform charges in, shown so nobody is surprised. */
		currency: text('currency').default('USD').notNull(),
		/** CTA text. Falls back to "Give with {companyName}" when blank. */
		buttonLabel: text('button_label'),
		/** A short caveat or selling point, e.g. Zeffy taking no platform fee. */
		note: text('note'),
		/** Pulls this option to the top and gives it the filled button treatment. */
		isFeatured: integer('is_featured', { mode: 'boolean' }).default(false).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [index('donation_campaigns_active_idx').on(table.isActive, table.sortOrder)]
);

export const donors = sqliteTable(
	'donors',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		fullName: text('full_name').notNull(),
		email: text('email'),
		phone: text('phone'),
		/** Drives which payment account and currency the donate page leads with. */
		isDiaspora: integer('is_diaspora', { mode: 'boolean' }).default(false).notNull(),
		country: text('country'),
		preferredLanguage: text('preferred_language', { enum: ['en', 'am'] })
			.default('en')
			.notNull(),
		/** Cached sum of completed donations, in `lifetimeCurrency` minor units. */
		lifetimeTotal: integer('lifetime_total').default(0).notNull(),
		lifetimeCurrency: text('lifetime_currency').default('ETB').notNull(),
		donationCount: integer('donation_count').default(0).notNull(),
		lastDonationAt: timestampMs('last_donation_at'),
		/** Opt-in, checked before any newsletter or reminder send. */
		acceptsContact: integer('accepts_contact', { mode: 'boolean' }).default(true).notNull(),
		notes: text('notes'),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		...publicFields
	},
	(table) => [
		index('donors_email_idx').on(table.email),
		index('donors_phone_idx').on(table.phone),
		index('donors_name_idx').on(table.fullName)
	]
);

export const donations = sqliteTable(
	'donations',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		donorId: integer('donor_id').references(() => donors.id, { onDelete: 'set null' }),
		/** Minor units. 500 birr is stored as 50000. */
		amount: integer('amount').notNull(),
		currency: text('currency').default('ETB').notNull(),
		frequency: text('frequency', { enum: ['one_time', 'monthly'] })
			.default('one_time')
			.notNull(),
		designationType: text('designation_type', {
			enum: ['general_fund', 'pillar', 'future_initiative']
		})
			.default('general_fund')
			.notNull(),
		designationPillarId: integer('designation_pillar_id').references(() => pillars.id, {
			onDelete: 'set null'
		}),
		designationInitiativeId: integer('designation_initiative_id').references(
			() => futureInitiatives.id,
			{ onDelete: 'set null' }
		),
		paymentMethodId: integer('payment_method_id').references(() => paymentMethods.id, {
			onDelete: 'set null'
		}),
		paymentAccountId: integer('payment_account_id').references(() => paymentAccounts.id, {
			onDelete: 'set null'
		}),
		/**
		 * `pending_reconciliation` is the default for bank transfers: the donor has
		 * told us they will send money, and finance has not yet matched it against
		 * a statement line. Nothing counts toward the public "funds raised" figure
		 * until it reaches `completed`.
		 */
		status: text('status', {
			enum: ['pending_reconciliation', 'pledged', 'completed', 'failed', 'refunded', 'cancelled']
		})
			.default('pending_reconciliation')
			.notNull(),
		/** Shown to CBE-transfer donors to quote on their transfer. Unique. */
		referenceCode: text('reference_code').notNull().unique(),
		/** From the payment provider, for card and PayPal. */
		providerTransactionId: text('provider_transaction_id'),
		/** The donor's own uploaded transfer receipt, which speeds reconciliation. */
		receiptFileId: integer('receipt_file_id').references(() => files.id, { onDelete: 'set null' }),
		receiptSentAt: timestampMs('receipt_sent_at'),
		completedAt: timestampMs('completed_at'),
		donorMessage: text('donor_message'),
		isAnonymous: integer('is_anonymous', { mode: 'boolean' }).default(false).notNull(),
		/** Set when this donation fulfils a month of a standing pledge. */
		recurringPledgeId: integer('recurring_pledge_id'),
		regionId: integer('region_id').references(() => regions.id, { onDelete: 'set null' }),
		...publicFields
	},
	(table) => [
		// The reconciliation queue and the impact totals both scan by status.
		index('donations_status_idx').on(table.status, table.createdAt),
		index('donations_donor_idx').on(table.donorId, table.createdAt),
		index('donations_designation_idx').on(table.designationType, table.designationPillarId),
		index('donations_pledge_idx').on(table.recurringPledgeId)
	]
);

/**
 * A standing commitment, not a charge. True auto-debit does not exist on CBE
 * transfers, so a "monthly donor" in Ethiopia is a person who gets a reminder
 * and makes a transfer — this table tracks the promise and the reminder, and
 * each fulfilled month becomes its own `donations` row.
 */
export const recurringPledges = sqliteTable(
	'recurring_pledges',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		donorId: integer('donor_id')
			.notNull()
			.references(() => donors.id, { onDelete: 'cascade' }),
		amount: integer('amount').notNull(),
		currency: text('currency').default('ETB').notNull(),
		designationType: text('designation_type', {
			enum: ['general_fund', 'pillar', 'future_initiative']
		})
			.default('general_fund')
			.notNull(),
		designationPillarId: integer('designation_pillar_id').references(() => pillars.id, {
			onDelete: 'set null'
		}),
		designationInitiativeId: integer('designation_initiative_id').references(
			() => futureInitiatives.id,
			{ onDelete: 'set null' }
		),
		status: text('status', { enum: ['active', 'paused', 'cancelled'] })
			.default('active')
			.notNull(),
		/** Date, not timestamp: reminders go out on a day, not at an instant. */
		nextReminderDate: text('next_reminder_date'),
		lastReminderSentAt: timestampMs('last_reminder_sent_at'),
		reminderChannel: text('reminder_channel', { enum: ['email', 'sms', 'telegram'] })
			.default('email')
			.notNull(),
		startedAt: timestampMs('started_at'),
		cancelledAt: timestampMs('cancelled_at'),
		...publicFields
	},
	(table) => [
		index('recurring_pledges_donor_idx').on(table.donorId),
		// The reminder job's only query: active pledges due on or before today.
		index('recurring_pledges_due_idx').on(table.status, table.nextReminderDate)
	]
);

/** Audit trail of the manual bank-matching step. Append-only in practice. */
export const donationReconciliationLog = sqliteTable(
	'donation_reconciliation_log',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		donationId: integer('donation_id')
			.notNull()
			.references(() => donations.id, { onDelete: 'cascade' }),
		matchedBy: text('matched_by').references(() => user.id, { onDelete: 'set null' }),
		matchedAt: timestampMs('matched_at').default(nowMs).notNull(),
		/** The statement line, transfer ID, or teller note the match was made on. */
		bankReferenceNote: text('bank_reference_note'),
		/** What the donation moved from and to, so a reversal is explicable. */
		previousStatus: text('previous_status'),
		newStatus: text('new_status'),
		/** Set when the bank shows a different figure than the donor pledged. */
		amountMatched: integer('amount_matched'),
		createdAt: timestampMs('created_at').default(nowMs).notNull()
	},
	(table) => [index('reconciliation_donation_idx').on(table.donationId)]
);

/* ==========================================================================
   3.5b IN-KIND GIVING — the gifts that are not money
   ==========================================================================

   A donation of 400 birr and a donation of four boxes of children's coats are
   the same act of giving and almost nothing else in common, which is why they
   are separate tables rather than a nullable `amount` on `donations`.

   Goods have to be described, judged, collected, weighed, stored and handed
   on. None of that fits a row whose whole job is "this much money, this
   currency, has it landed yet". Splitting them keeps two things honest:

    - **The money figure stays a money figure.** The public "funds raised"
      counter sums completed `donations`. A pledge of used furniture with an
      optimistic price on it can never quietly inflate it, because it is not in
      that table. `estimatedValue` here is what the donor guessed, kept for
      reporting and for the tax paperwork, and it is nobody's income.
    - **The workflow is the real one.** An in-kind offer is accepted or
      declined *before* it arrives — we cannot take a truckload of clothes with
      nowhere to put it — so its statuses are about a conversation and a
      collection, not about a bank statement.
   ========================================================================== */

/**
 * The editable catalogue of what the Foundation will take.
 *
 * Config, not code (§0): the day we stop accepting used mattresses, or start
 * accepting laptops, is a row edit. The `requires*` flags drive which extra
 * questions the donate form asks about an item — food asks for a use-by date,
 * clothing asks for sizes — so a new category comes with its own questions
 * without touching the component.
 */
export const inKindCategories = sqliteTable(
	'in_kind_categories',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		nameAm: text('name_am'),
		description: text('description'),
		icon: text('icon'),
		/** Which programme normally receives these. Null shows it to everyone. */
		pillarId: integer('pillar_id').references(() => pillars.id, { onDelete: 'set null' }),
		/** The unit the form suggests first: "boxes", "kg", "pairs", "items". */
		defaultUnit: text('default_unit').default('items').notNull(),
		/** Food and medicine: ask for a use-by date and flag cold storage. */
		requiresExpiry: integer('requires_expiry', { mode: 'boolean' }).default(false).notNull(),
		/** Clothing and shoes: ask for sizes and who they would fit. */
		requiresSizing: integer('requires_sizing', { mode: 'boolean' }).default(false).notNull(),
		/** Furniture and appliances: warn that collection needs a vehicle. */
		requiresTransport: integer('requires_transport', { mode: 'boolean' }).default(false).notNull(),
		/**
		 * Shown on the form before anything is offered. Medicine has rules,
		 * cots have safety standards, and it is kinder to say so up front than
		 * to decline a carload after somebody has driven across Addis Ababa.
		 */
		acceptanceNote: text('acceptance_note'),
		/**
		 * Listed but not accepted right now — the category still renders, greyed,
		 * with its `acceptanceNote` explaining why. Deleting it instead would
		 * orphan the items already recorded against it.
		 */
		isAcceptingNow: integer('is_accepting_now', { mode: 'boolean' }).default(true).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [
		index('in_kind_categories_active_idx').on(table.isActive, table.sortOrder),
		index('in_kind_categories_pillar_idx').on(table.pillarId)
	]
);

/**
 * One offer of goods, from the moment somebody says "I have things to give"
 * to the moment they reach a family.
 *
 * The row is created at `offered`: nothing has been promised on our side yet.
 * Staff move it through review, collection and intake, and only `received`
 * means the goods are actually in the Foundation's hands.
 */
export const inKindDonations = sqliteTable(
	'in_kind_donations',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** `SAF-GIK-2026-0042`. Quoted on the collection call and on the label. */
		referenceCode: text('reference_code').notNull().unique(),
		/** Same donor record as a cash gift, so one person is one donor row. */
		donorId: integer('donor_id').references(() => donors.id, { onDelete: 'set null' }),

		/* --- Who is giving -------------------------------------------------- */

		/** Kept as typed, alongside `donorId`: the donor row is deduplicated and
		    updated over time, and this is what this particular offer said. */
		donorName: text('donor_name').notNull(),
		donorEmail: text('donor_email'),
		donorPhone: text('donor_phone'),
		/** A school clearing a store room needs different handling to a family. */
		donorType: text('donor_type', {
			enum: [
				'individual',
				'family',
				'business',
				'school',
				'faith_group',
				'association',
				'ngo',
				'government',
				'other'
			]
		})
			.default('individual')
			.notNull(),
		organisationName: text('organisation_name'),
		isDiaspora: integer('is_diaspora', { mode: 'boolean' }).default(false).notNull(),
		preferredContactChannel: text('preferred_contact_channel', {
			enum: ['phone', 'sms', 'email', 'telegram', 'whatsapp']
		})
			.default('phone')
			.notNull(),
		/** "Afternoons", "after 6pm" — a collection call at the wrong hour fails. */
		bestTimeToContact: text('best_time_to_contact'),

		/* --- What it is ------------------------------------------------------ */

		/**
		 * A one-line description for the queue — "4 boxes of children's coats".
		 * Composed from the items when the donor does not write one, so every
		 * list screen has something to show without joining the item rows.
		 */
		summary: text('summary').notNull(),
		/** Denormalised from `in_kind_donation_items`, for the same reason. */
		itemCount: integer('item_count').default(0).notNull(),
		totalQuantity: integer('total_quantity').default(0).notNull(),
		/**
		 * The donor's own guess, in minor units. **Not money received** — see the
		 * note at the head of this section. Kept for the annual report and for
		 * the receipt, never summed into the public funds figure.
		 */
		estimatedValue: integer('estimated_value'),
		currency: text('currency').default('ETB').notNull(),
		valuationBasis: text('valuation_basis', {
			enum: ['unknown', 'donor_estimate', 'purchase_receipt', 'professional_appraisal']
		})
			.default('donor_estimate')
			.notNull(),
		/** Any of the items perishes; drives the "collect this week" flag. */
		isPerishable: integer('is_perishable', { mode: 'boolean' }).default(false).notNull(),
		needsColdStorage: integer('needs_cold_storage', { mode: 'boolean' }).default(false).notNull(),
		/**
		 * Medicines, powered equipment, anything with a rule attached. Set by the
		 * donor so review can start with the question that might stop it.
		 */
		hasRestrictedItems: integer('has_restricted_items', { mode: 'boolean' })
			.default(false)
			.notNull(),
		restrictedItemsNote: text('restricted_items_note'),

		/* --- Where it should go ---------------------------------------------- */

		designationType: text('designation_type', {
			enum: ['general_fund', 'pillar', 'future_initiative']
		})
			.default('general_fund')
			.notNull(),
		designationPillarId: integer('designation_pillar_id').references(() => pillars.id, {
			onDelete: 'set null'
		}),
		designationInitiativeId: integer('designation_initiative_id').references(
			() => futureInitiatives.id,
			{ onDelete: 'set null' }
		),
		regionId: integer('region_id').references(() => regions.id, { onDelete: 'set null' }),

		/* --- Getting hold of it ----------------------------------------------- */

		handoverMethod: text('handover_method', {
			enum: ['dropoff', 'pickup', 'courier', 'already_shipped']
		})
			.default('dropoff')
			.notNull(),
		/** Whoever will actually be there, which is often not the donor. */
		pickupContactName: text('pickup_contact_name'),
		pickupContactPhone: text('pickup_contact_phone'),
		pickupAddressLine: text('pickup_address_line'),
		pickupCity: text('pickup_city'),
		/** Addis Ababa runs on landmarks, not street numbers. */
		pickupLandmark: text('pickup_landmark'),
		/** Third floor, no lift, gate locked after five — what the driver needs. */
		accessNotes: text('access_notes'),
		/** How big the load is, in terms a coordinator can book a vehicle against. */
		loadSize: text('load_size', {
			enum: ['handheld', 'car_boot', 'pickup_truck', 'small_truck', 'container']
		})
			.default('car_boot')
			.notNull(),
		estimatedWeightKg: integer('estimated_weight_kg'),
		requiresVehicle: integer('requires_vehicle', { mode: 'boolean' }).default(false).notNull(),
		/** Heavy or awkward: the collection needs more than one pair of hands. */
		requiresHelpLoading: integer('requires_help_loading', { mode: 'boolean' })
			.default(false)
			.notNull(),
		/** ISO dates. The window in which the goods can be handed over. */
		availableFrom: text('available_from'),
		availableUntil: text('available_until'),

		/* --- Paperwork and recognition ---------------------------------------- */

		receiptRequested: integer('receipt_requested', { mode: 'boolean' }).default(false).notNull(),
		/** A company writing this off needs more than a thank-you note. */
		taxReceiptRequired: integer('tax_receipt_required', { mode: 'boolean' })
			.default(false)
			.notNull(),
		taxIdNumber: text('tax_id_number'),
		isAnonymous: integer('is_anonymous', { mode: 'boolean' }).default(false).notNull(),
		/** How they wish to be named publicly, when that is not their own name. */
		recognitionName: text('recognition_name'),
		donorMessage: text('donor_message'),
		heardAbout: text('heard_about'),
		/**
		 * The moment consent was given, not a boolean: an offer carries a home
		 * address and a phone number, and "when did they agree to us holding
		 * this" is a question a `true` cannot answer.
		 */
		consentToContactAt: timestampMs('consent_to_contact_at'),

		/* --- What happened next ------------------------------------------------ */

		/**
		 * Fixed, unlike the configurable `status_options` used by cases: each
		 * value here changes what the code does — `accepted` schedules a
		 * collection, `received` releases the items to distribution — so these
		 * are not a label a dashboard may rename.
		 */
		status: text('status', {
			enum: [
				'offered',
				'under_review',
				'accepted',
				'declined',
				'scheduled',
				'received',
				'distributed',
				'cancelled'
			]
		})
			.default('offered')
			.notNull(),
		reviewedById: text('reviewed_by_id').references(() => user.id, { onDelete: 'set null' }),
		reviewedAt: timestampMs('reviewed_at'),
		reviewNotes: text('review_notes'),
		/** Said to the donor, so a decline can be explained rather than just sent. */
		declineReason: text('decline_reason'),
		assignedToId: text('assigned_to_id').references(() => user.id, { onDelete: 'set null' }),
		/** ISO date plus a human window — "Tuesday", "between 9 and 12". */
		scheduledFor: text('scheduled_for'),
		scheduledWindow: text('scheduled_window'),
		receivedAt: timestampMs('received_at'),
		receivedById: text('received_by_id').references(() => user.id, { onDelete: 'set null' }),
		/** What actually turned up, when it differs from what was offered. */
		intakeNotes: text('intake_notes'),
		/** Where the goods went; the closing note on the offer. */
		distributionNotes: text('distribution_notes'),
		acknowledgementSentAt: timestampMs('acknowledgement_sent_at'),

		language: text('language', { enum: ['en', 'am'] })
			.default('en')
			.notNull(),
		isRead: integer('is_read', { mode: 'boolean' }).default(false).notNull(),
		...publicFields
	},
	(table) => [
		// The coordinator's queue: what is waiting, oldest first.
		index('in_kind_donations_status_idx').on(table.status, table.createdAt),
		index('in_kind_donations_donor_idx').on(table.donorId, table.createdAt),
		index('in_kind_donations_designation_idx').on(table.designationType, table.designationPillarId),
		// The collection run: everything booked for a given day.
		index('in_kind_donations_scheduled_idx').on(table.scheduledFor, table.status),
		index('in_kind_donations_region_idx').on(table.regionId)
	]
);

/**
 * The lines of an offer — one row per kind of thing.
 *
 * Rows rather than a JSON blob because these are the questions the warehouse
 * asks: how many coats, what sizes, what condition, when does the milk expire.
 * A blob cannot answer "how many blankets were donated this quarter", and that
 * is the report somebody wants every quarter.
 */
export const inKindDonationItems = sqliteTable(
	'in_kind_donation_items',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		inKindDonationId: integer('in_kind_donation_id')
			.notNull()
			.references(() => inKindDonations.id, { onDelete: 'cascade' }),
		categoryId: integer('category_id').references(() => inKindCategories.id, {
			onDelete: 'set null'
		}),
		description: text('description').notNull(),
		quantity: integer('quantity').default(1).notNull(),
		/** Free text, seeded from the category's `defaultUnit`. */
		unit: text('unit').default('items').notNull(),
		condition: text('condition', {
			enum: ['new', 'like_new', 'good', 'used', 'needs_repair']
		})
			.default('good')
			.notNull(),

		/* --- Clothing and anything else that has to fit somebody -------------- */

		ageGroup: text('age_group', { enum: ['any', 'infant', 'child', 'teen', 'adult', 'elderly'] })
			.default('any')
			.notNull(),
		gender: text('gender', { enum: ['unisex', 'female', 'male'] })
			.default('unisex')
			.notNull(),
		/** "4–6 years", "EU 38–42", "L and XL" — a range, as the donor has it. */
		sizeRange: text('size_range'),
		/** Matters for equipment and appliances, and for spare parts later. */
		brandOrModel: text('brand_or_model'),

		/* --- Food, medicine, anything with a clock on it ---------------------- */

		isPerishable: integer('is_perishable', { mode: 'boolean' }).default(false).notNull(),
		/** ISO date. Nothing is distributed past it. */
		expiresOn: text('expires_on'),
		needsRefrigeration: integer('needs_refrigeration', { mode: 'boolean' })
			.default(false)
			.notNull(),

		/** Minor units, per the line. The donor's estimate, like the parent row. */
		estimatedValue: integer('estimated_value'),
		currency: text('currency').default('ETB').notNull(),
		notes: text('notes'),

		/* --- Filled in at intake, when the goods are counted ------------------ */

		/** What was actually taken in, which may be less than what was offered. */
		acceptedQuantity: integer('accepted_quantity'),
		intakeNote: text('intake_note'),

		sortOrder: integer('sort_order').default(0).notNull(),
		...publicFields
	},
	(table) => [
		index('in_kind_items_donation_idx').on(table.inKindDonationId, table.sortOrder),
		// "How many blankets this quarter" — the report this table exists for.
		index('in_kind_items_category_idx').on(table.categoryId),
		// The expiry sweep: perishable stock, soonest first.
		index('in_kind_items_expiry_idx').on(table.expiresOn)
	]
);

/**
 * Photos of the goods, which are the difference between accepting a donation
 * and guessing about it. Private files: they are taken inside somebody's home.
 */
export const inKindDonationPhotos = sqliteTable(
	'in_kind_donation_photos',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		inKindDonationId: integer('in_kind_donation_id')
			.notNull()
			.references(() => inKindDonations.id, { onDelete: 'cascade' }),
		fileId: integer('file_id')
			.notNull()
			.references(() => files.id, { onDelete: 'cascade' }),
		/** Set when the photo is of one line rather than the whole offer. */
		itemId: integer('item_id').references(() => inKindDonationItems.id, { onDelete: 'set null' }),
		caption: text('caption'),
		/** Whether the photo came with the offer or was taken at intake. */
		source: text('source', { enum: ['donor', 'intake'] })
			.default('donor')
			.notNull(),
		...publicFields
	},
	(table) => [index('in_kind_photos_donation_idx').on(table.inKindDonationId)]
);

/* ==========================================================================
   3.6 VOLUNTEERS
   ========================================================================== */

/**
 * Broken out from `form_submissions` on purpose: the safeguarding and
 * credential workflow deserves first-class, queryable columns rather than
 * everything jammed into a JSON blob. The public-facing questions still come
 * from the `volunteer-application` form definition; the workflow fields below
 * are staff-managed.
 */
export const volunteerApplications = sqliteTable(
	'volunteer_applications',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		referenceNumber: text('reference_number').notNull().unique(),
		fullName: text('full_name').notNull(),
		email: text('email'),
		phone: text('phone'),
		regionId: integer('region_id').references(() => regions.id, { onDelete: 'set null' }),
		/** Freeform, for the town or sub-city the volunteer can actually travel from. */
		city: text('city'),

		/* --- Who they are ------------------------------------------------- */

		dateOfBirth: text('date_of_birth'),
		gender: text('gender', { enum: ['female', 'male', 'other', 'prefer_not_to_say'] }),
		occupation: text('occupation'),
		/** The one contact we call if something happens on a placement. */
		emergencyContactName: text('emergency_contact_name'),
		emergencyContactPhone: text('emergency_contact_phone'),
		emergencyContactRelationship: text('emergency_contact_relationship'),

		/* --- What they are offering ---------------------------------------- */

		/**
		 * Superseded by `volunteer_interests`, which is the queryable truth.
		 * Still written on both paths so the legacy dynamic-form route and any
		 * saved report keep resolving. Read the join table in new code.
		 */
		areasOfInterest: text('areas_of_interest', { mode: 'json' }).$type<(number | string)[]>(),
		/**
		 * Only the skills the catalogue does not list. Everything a coordinator
		 * can filter on lives in `volunteer_application_skills`; this is the
		 * "something else?" box, kept so an unusual skill is not lost while
		 * nobody has got round to adding it to the catalogue.
		 */
		skills: text('skills', { mode: 'json' }).$type<string[]>(),
		/**
		 * Superseded by `volunteer_availability`. Kept for the legacy form path
		 * and for the free-text caveats a grid of time slots cannot express
		 * ("not during exam weeks").
		 */
		availability: text('availability'),
		/** Hours a week the volunteer expects to give. */
		hoursPerWeek: integer('hours_per_week'),
		/** How long they expect to stay; null means open-ended. */
		commitmentMonths: integer('commitment_months'),
		/** ISO date. The earliest they can start. */
		availableFrom: text('available_from'),
		/** Why they want to do this — the answer a coordinator actually reads. */
		motivation: text('motivation'),
		/** Free text; the option list lives in `status_options`-style config. */
		heardAbout: text('heard_about'),

		/* --- Professional standing ----------------------------------------- */

		/**
		 * Derived from `volunteer_credentials`, not taken from the applicant's
		 * word for it: true when they have claimed at least one credential.
		 */
		isProfessional: integer('is_professional', { mode: 'boolean' }).default(false).notNull(),
		/**
		 * A human-readable summary of `volunteer_credentials`, rebuilt by
		 * `recomputeCredentials`. It exists because `recomputeSafeguarding` and
		 * `canApproveVolunteer` gate on "does this volunteer claim credentials",
		 * and a single text column keeps that check one read rather than a join.
		 */
		professionalCredentials: text('professional_credentials'),
		/** Answers to any extra questions on the volunteer form definition. */
		data: text('data', { mode: 'json' }).$type<Record<string, unknown>>(),
		/* --- Declarations, captured at submission --------------------------- */

		/**
		 * Consent to the background and reference checks. Stored as the moment
		 * it was given rather than a boolean: a safeguarding auditor asks *when*
		 * this volunteer agreed, and a `true` cannot answer that.
		 */
		backgroundCheckConsentAt: timestampMs('background_check_consent_at'),
		codeOfConductAgreedAt: timestampMs('code_of_conduct_agreed_at'),
		/** Self-declaration. A `true` is not a bar; an undisclosed one is. */
		hasPriorConviction: integer('has_prior_conviction', { mode: 'boolean' }),
		priorConvictionDetail: text('prior_conviction_detail'),

		statusId: integer('status_id').references(() => statusOptions.id, { onDelete: 'set null' }),
		/** Derived from `volunteer_references` by `recomputeReferences`. */
		referencesChecked: integer('references_checked', { mode: 'boolean' }).default(false).notNull(),
		/** Nullable — only meaningful for professional roles. */
		credentialsVerified: integer('credentials_verified', { mode: 'boolean' }),
		/**
		 * Derived: set true only when every active checklist item has a row in
		 * `volunteer_safeguarding_checks`. The server-side status-transition
		 * function refuses to move an application to an `approved` stage while
		 * this is false — a safeguarding control, not a UI nicety, so it is not
		 * bypassable by posting directly to the action.
		 */
		safeguardingChecklistComplete: integer('safeguarding_checklist_complete', { mode: 'boolean' })
			.default(false)
			.notNull(),
		assignedReviewerId: text('assigned_reviewer_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		language: text('language', { enum: ['en', 'am'] })
			.default('en')
			.notNull(),
		isRead: integer('is_read', { mode: 'boolean' }).default(false).notNull(),
		...publicFields
	},
	(table) => [
		index('volunteer_applications_status_idx').on(table.statusId, table.createdAt),
		index('volunteer_applications_reviewer_idx').on(table.assignedReviewerId),
		index('volunteer_applications_region_idx').on(table.regionId)
	]
);

/** Config-driven, so the required safeguarding steps can change from the dashboard. */
export const volunteerSafeguardingChecklistItems = sqliteTable(
	'volunteer_safeguarding_checklist_items',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		label: text('label').notNull(),
		labelAm: text('label_am'),
		description: text('description'),
		/** Only required of volunteers claiming professional credentials. */
		professionalOnly: integer('professional_only', { mode: 'boolean' }).default(false).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [index('safeguarding_items_active_idx').on(table.isActive, table.sortOrder)]
);

export const volunteerSafeguardingChecks = sqliteTable(
	'volunteer_safeguarding_checks',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		volunteerApplicationId: integer('volunteer_application_id')
			.notNull()
			.references(() => volunteerApplications.id, { onDelete: 'cascade' }),
		checklistItemId: integer('checklist_item_id')
			.notNull()
			.references(() => volunteerSafeguardingChecklistItems.id, { onDelete: 'cascade' }),
		completedBy: text('completed_by').references(() => user.id, { onDelete: 'set null' }),
		completedAt: timestampMs('completed_at').default(nowMs).notNull(),
		note: text('note'),
		evidenceFileId: integer('evidence_file_id').references(() => files.id, { onDelete: 'set null' })
	},
	(table) => [
		uniqueIndex('safeguarding_check_unique').on(
			table.volunteerApplicationId,
			table.checklistItemId
		),
		index('safeguarding_checks_application_idx').on(table.volunteerApplicationId)
	]
);

export const volunteerPlacements = sqliteTable(
	'volunteer_placements',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		volunteerApplicationId: integer('volunteer_application_id')
			.notNull()
			.references(() => volunteerApplications.id, { onDelete: 'cascade' }),
		pillarId: integer('pillar_id').references(() => pillars.id, { onDelete: 'set null' }),
		regionId: integer('region_id').references(() => regions.id, { onDelete: 'set null' }),
		roleDescription: text('role_description'),
		hoursPerWeek: integer('hours_per_week'),
		startedAt: text('started_at'),
		endedAt: text('ended_at'),
		supervisorId: text('supervisor_id').references(() => user.id, { onDelete: 'set null' }),
		...secureFields
	},
	(table) => [
		index('volunteer_placements_application_idx').on(table.volunteerApplicationId),
		index('volunteer_placements_pillar_idx').on(table.pillarId)
	]
);

/* --------------------------------------------------------------------------
   3.6a Skills

   "Which volunteers can drive, and are free on Saturday mornings?" is the
   question a coordinator actually asks, and it has to be a `where` clause. A
   JSON array of typed-in strings cannot answer it — one volunteer writes
   "driving", the next writes "I have a car" — so the skills a volunteer can
   claim are rows, chosen from a list, and the claim is a join row.

   The catalogue is editable from the dashboard, which is what stops this from
   needing a deploy every time the Foundation starts doing something new (§0).
   -------------------------------------------------------------------------- */

/** Groups the skill list on the public form. Purely for presentation. */
export const volunteerSkillCategories = sqliteTable(
	'volunteer_skill_categories',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		nameAm: text('name_am'),
		description: text('description'),
		/** Lucide icon name, resolved by `dynamic-icon.svelte`. */
		icon: text('icon'),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [index('volunteer_skill_categories_active_idx').on(table.isActive, table.sortOrder)]
);

export const volunteerSkills = sqliteTable(
	'volunteer_skills',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		nameAm: text('name_am'),
		description: text('description'),
		categoryId: integer('category_id').references(() => volunteerSkillCategories.id, {
			onDelete: 'set null'
		}),
		/**
		 * Claiming this skill obliges the volunteer to enter a credential —
		 * "clinical counselling" is not a thing you tick because you are a good
		 * listener. The public form enforces it; so does the server.
		 */
		requiresCredential: integer('requires_credential', { mode: 'boolean' })
			.default(false)
			.notNull(),
		/** Shown on the public form so a volunteer knows what they are claiming. */
		hint: text('hint'),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [
		index('volunteer_skills_category_idx').on(table.categoryId, table.sortOrder),
		index('volunteer_skills_active_idx').on(table.isActive, table.sortOrder)
	]
);

/** One volunteer's claim on one catalogue skill. */
export const volunteerApplicationSkills = sqliteTable(
	'volunteer_application_skills',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		volunteerApplicationId: integer('volunteer_application_id')
			.notNull()
			.references(() => volunteerApplications.id, { onDelete: 'cascade' }),
		skillId: integer('skill_id')
			.notNull()
			.references(() => volunteerSkills.id, { onDelete: 'cascade' }),
		/** Self-reported. `professional` means "this is my job", not "I am good at it". */
		proficiency: text('proficiency', {
			enum: ['basic', 'intermediate', 'advanced', 'professional']
		})
			.default('intermediate')
			.notNull(),
		yearsExperience: integer('years_experience'),
		note: text('note'),
		createdAt: timestampMs('created_at').default(nowMs).notNull()
	},
	(table) => [
		// Both columns are NOT NULL, so this genuinely constrains — see the note
		// on `impact_metrics_cache` for the case where it would not.
		uniqueIndex('volunteer_application_skill_unique').on(
			table.volunteerApplicationId,
			table.skillId
		),
		index('volunteer_application_skills_skill_idx').on(table.skillId)
	]
);

/* --------------------------------------------------------------------------
   3.6b Availability

   Slots are rows rather than an enum for the same reason regions are: the
   Foundation runs a Saturday distribution now and may run a Wednesday evening
   clinic next year, and that must be a dashboard row.

   A slot is a named window — a day plus a time range — and a volunteer's
   availability is a join row against it. `dayOfWeek` is nullable for slots
   that are not tied to a weekday ("public holidays", "on call").
   -------------------------------------------------------------------------- */

export const volunteerTimeSlots = sqliteTable(
	'volunteer_time_slots',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		label: text('label').notNull(),
		labelAm: text('label_am'),
		/** 0 = Sunday … 6 = Saturday. Null for a slot with no fixed day. */
		dayOfWeek: integer('day_of_week'),
		/** 24-hour `HH:MM`. Text rather than minutes-since-midnight so it reads in a query. */
		startTime: text('start_time'),
		endTime: text('end_time'),
		description: text('description'),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [
		index('volunteer_time_slots_active_idx').on(table.isActive, table.sortOrder),
		index('volunteer_time_slots_day_idx').on(table.dayOfWeek, table.startTime)
	]
);

export const volunteerAvailability = sqliteTable(
	'volunteer_availability',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		volunteerApplicationId: integer('volunteer_application_id')
			.notNull()
			.references(() => volunteerApplications.id, { onDelete: 'cascade' }),
		timeSlotId: integer('time_slot_id')
			.notNull()
			.references(() => volunteerTimeSlots.id, { onDelete: 'cascade' }),
		/** Seasonal availability — a student free only over the summer. */
		effectiveFrom: text('effective_from'),
		effectiveUntil: text('effective_until'),
		note: text('note'),
		createdAt: timestampMs('created_at').default(nowMs).notNull()
	},
	(table) => [
		uniqueIndex('volunteer_availability_unique').on(table.volunteerApplicationId, table.timeSlotId),
		index('volunteer_availability_slot_idx').on(table.timeSlotId)
	]
);

/* --------------------------------------------------------------------------
   3.6c Medical and mental-health professionals

   §3.6 gates approval on credential verification, so a credential cannot be a
   sentence in a textarea. Each claimed licence is its own row with its own
   verification state, because a volunteer may be a verified nurse and an
   unverified counsellor at the same time, and the placement rules differ.
   -------------------------------------------------------------------------- */

/** The catalogue of professions the Foundation recognises. Editable. */
export const volunteerProfessions = sqliteTable(
	'volunteer_professions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		nameAm: text('name_am'),
		category: text('category', {
			enum: ['medical', 'mental_health', 'allied_health', 'public_health', 'other']
		})
			.default('medical')
			.notNull(),
		/**
		 * Almost always true. False covers the roles that are genuinely
		 * unlicensed in Ethiopia but still clinical-adjacent — a trained
		 * community health worker, say.
		 */
		requiresLicense: integer('requires_license', { mode: 'boolean' }).default(true).notNull(),
		/** The body we ring to check, pre-filled on the form and the staff screen. */
		defaultLicensingBody: text('default_licensing_body'),
		description: text('description'),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [
		index('volunteer_professions_active_idx').on(table.isActive, table.sortOrder),
		index('volunteer_professions_category_idx').on(table.category, table.sortOrder)
	]
);

export const volunteerCredentials = sqliteTable(
	'volunteer_credentials',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		volunteerApplicationId: integer('volunteer_application_id')
			.notNull()
			.references(() => volunteerApplications.id, { onDelete: 'cascade' }),
		professionId: integer('profession_id').references(() => volunteerProfessions.id, {
			onDelete: 'set null'
		}),
		/** Set when the applicant picked "another profession"; a prompt to extend the catalogue. */
		otherProfession: text('other_profession'),
		licenseNumber: text('license_number'),
		/** Falls back to the profession's `defaultLicensingBody` when blank. */
		licensingBody: text('licensing_body'),
		specialization: text('specialization'),
		yearsExperience: integer('years_experience'),
		/** ISO dates, as typed. */
		issuedOn: text('issued_on'),
		expiresOn: text('expires_on'),
		/** The uploaded licence itself. Private — served through `/files`. */
		documentFileId: integer('document_file_id').references(() => files.id, {
			onDelete: 'set null'
		}),
		/**
		 * `verified` is the only value that opens the approval gate, and only
		 * staff with `volunteers.safeguarding` may set it. `expired` exists so a
		 * licence that lapses can be marked without erasing that it was once
		 * checked.
		 */
		verificationStatus: text('verification_status', {
			enum: ['pending', 'verified', 'rejected', 'expired']
		})
			.default('pending')
			.notNull(),
		verifiedBy: text('verified_by').references(() => user.id, { onDelete: 'set null' }),
		verifiedAt: timestampMs('verified_at'),
		verificationNote: text('verification_note'),
		...publicFields
	},
	(table) => [
		index('volunteer_credentials_application_idx').on(table.volunteerApplicationId),
		index('volunteer_credentials_status_idx').on(table.verificationStatus),
		index('volunteer_credentials_expiry_idx').on(table.expiresOn)
	]
);

/* --------------------------------------------------------------------------
   3.6d References

   `volunteer_applications.references_checked` was a boolean over a textarea
   of two names. It is now derived from these rows, so "who called them, and
   what did they say" has somewhere to live.
   -------------------------------------------------------------------------- */

export const volunteerReferences = sqliteTable(
	'volunteer_references',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		volunteerApplicationId: integer('volunteer_application_id')
			.notNull()
			.references(() => volunteerApplications.id, { onDelete: 'cascade' }),
		fullName: text('full_name').notNull(),
		relationship: text('relationship'),
		organization: text('organization'),
		email: text('email'),
		phone: text('phone'),
		status: text('status', {
			enum: ['pending', 'contacted', 'satisfactory', 'unsatisfactory', 'unreachable']
		})
			.default('pending')
			.notNull(),
		responseNote: text('response_note'),
		contactedBy: text('contacted_by').references(() => user.id, { onDelete: 'set null' }),
		contactedAt: timestampMs('contacted_at'),
		sortOrder: integer('sort_order').default(0).notNull(),
		...publicFields
	},
	(table) => [
		index('volunteer_references_application_idx').on(table.volunteerApplicationId, table.sortOrder),
		index('volunteer_references_status_idx').on(table.status)
	]
);

/** Which programmes a volunteer wants to work on. The queryable form of `areas_of_interest`. */
export const volunteerInterests = sqliteTable(
	'volunteer_interests',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		volunteerApplicationId: integer('volunteer_application_id')
			.notNull()
			.references(() => volunteerApplications.id, { onDelete: 'cascade' }),
		pillarId: integer('pillar_id')
			.notNull()
			.references(() => pillars.id, { onDelete: 'cascade' }),
		createdAt: timestampMs('created_at').default(nowMs).notNull()
	},
	(table) => [
		uniqueIndex('volunteer_interest_unique').on(table.volunteerApplicationId, table.pillarId),
		index('volunteer_interests_pillar_idx').on(table.pillarId)
	]
);

/* ==========================================================================
   3.7 CONTACT

   §3.7 allows the contact form either to ride on `form_submissions` or to have
   its own table, and asks only for consistency. It used to ride on
   `form_submissions`; it no longer does.

   What changed the trade is routing and answering. A general enquiry is not a
   case: it has no pillar, it is never assigned to a caseworker, and what staff
   need from it is "who is answering this, and did anyone reply?" — a question
   `form_submissions` has nowhere to put, because a case's history lives in
   case notes that are deliberately internal and never sent to anybody.

   So a message is its own row with its own reply thread, and the *topics* it
   can be about are catalogue rows that carry their own routing: who gets
   told, who it lands on, how quickly it should be answered.
   ========================================================================== */

/**
 * The enquiry topics offered on `/contact`, each carrying its own routing.
 *
 * This is the row a staff member edits when press enquiries should start going
 * to the communications lead instead of the general inbox — not a code change,
 * and not a rule buried in a notification function (§0).
 */
export const contactSubjects = sqliteTable(
	'contact_subjects',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		nameAm: text('name_am'),
		/** Shown under the option on the public form. */
		description: text('description'),
		/** Lucide icon name, resolved by `dynamic-icon.svelte`. */
		icon: text('icon'),
		/**
		 * Who is emailed when a message on this topic arrives. Empty falls back
		 * to `contact.email_primary`, so a new topic is never a black hole.
		 */
		notifyEmails: text('notify_emails', { mode: 'json' }).$type<string[]>(),
		/** Pre-assigns the message, so it lands in someone's queue on arrival. */
		defaultAssigneeId: text('default_assignee_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		/**
		 * The promise the Foundation makes itself about this topic. Drives the
		 * overdue flag on the message list; not shown publicly unless
		 * `publicResponseNote` says so in words.
		 */
		targetResponseHours: integer('target_response_hours'),
		publicResponseNote: text('public_response_note'),
		/**
		 * Routes an enquiry that is really a case toward the right place: shown
		 * on the form as a pointer to the pillar's application, rather than
		 * silently turning a message into an application behind the sender's
		 * back.
		 */
		suggestedPillarId: integer('suggested_pillar_id').references(() => pillars.id, {
			onDelete: 'set null'
		}),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [index('contact_subjects_active_idx').on(table.isActive, table.sortOrder)]
);

/**
 * One enquiry.
 *
 * `source` exists because not every message arrives through the form — someone
 * rings, or walks in, and the record of that conversation belongs in the same
 * queue as the rest rather than in a notebook.
 */
export const contactMessages = sqliteTable(
	'contact_messages',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		referenceNumber: text('reference_number').notNull().unique(),
		subjectId: integer('subject_id').references(() => contactSubjects.id, {
			onDelete: 'set null'
		}),
		/** Free text when the sender picked nothing, or on a migrated message. */
		subjectOther: text('subject_other'),

		fullName: text('full_name').notNull(),
		email: text('email'),
		phone: text('phone'),
		organization: text('organization'),
		message: text('message').notNull(),
		/** How they would rather be answered. Not a guarantee, but it is rude to ignore. */
		preferredChannel: text('preferred_channel', { enum: ['email', 'phone', 'either'] })
			.default('either')
			.notNull(),
		regionId: integer('region_id').references(() => regions.id, { onDelete: 'set null' }),

		source: text('source', { enum: ['web_form', 'email', 'phone', 'walk_in', 'social', 'other'] })
			.default('web_form')
			.notNull(),
		/** Answers to anything the form gained later; the same escape hatch cases have. */
		data: text('data', { mode: 'json' }).$type<Record<string, unknown>>(),

		statusId: integer('status_id').references(() => statusOptions.id, { onDelete: 'set null' }),
		priority: text('priority', { enum: ['low', 'normal', 'high', 'urgent'] })
			.default('normal')
			.notNull(),
		assignedToId: text('assigned_to_id').references(() => user.id, { onDelete: 'set null' }),

		/**
		 * Stamped by the first non-internal reply, and never moved afterwards —
		 * "how long did we take to answer" is measured against the first reply,
		 * not the last.
		 */
		firstRespondedAt: timestampMs('first_responded_at'),
		closedAt: timestampMs('closed_at'),

		/** Unread badge in the dashboard; not part of the workflow. */
		isRead: integer('is_read', { mode: 'boolean' }).default(false).notNull(),
		/** Hidden from the default list rather than deleted, so it can be undone. */
		isSpam: integer('is_spam', { mode: 'boolean' }).default(false).notNull(),
		/** Opted in to hearing from the Foundation again, separately from a reply. */
		joinNewsletter: integer('join_newsletter', { mode: 'boolean' }).default(false).notNull(),

		language: text('language', { enum: ['en', 'am'] })
			.default('en')
			.notNull(),
		...publicFields
	},
	(table) => [
		// The list's default view: unanswered first, newest first.
		index('contact_messages_status_idx').on(table.statusId, table.createdAt),
		index('contact_messages_subject_idx').on(table.subjectId, table.createdAt),
		index('contact_messages_assignee_idx').on(table.assignedToId),
		index('contact_messages_unread_idx').on(table.isRead, table.createdAt),
		// Duplicate detection: the same person writing twice in a week.
		index('contact_messages_email_idx').on(table.email)
	]
);

/**
 * The conversation: replies sent to the enquirer and internal notes about
 * them, in one ordered thread.
 *
 * `isInternal` is the whole safety of this table. An internal note and a sent
 * reply look identical in a list, and the difference is whether the sender has
 * read it — so the flag is explicit on every row and the compose form defaults
 * to whichever the staff member chose, never to "send".
 */
export const contactMessageReplies = sqliteTable(
	'contact_message_replies',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		contactMessageId: integer('contact_message_id')
			.notNull()
			.references(() => contactMessages.id, { onDelete: 'cascade' }),
		/** Null for a note the system wrote (a status change). */
		authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
		body: text('body').notNull(),
		/** True = nobody outside the Foundation has seen this. */
		isInternal: integer('is_internal', { mode: 'boolean' }).default(false).notNull(),
		channel: text('channel', { enum: ['email', 'phone', 'sms', 'in_person', 'note'] })
			.default('email')
			.notNull(),
		/** Set once the email actually went out; null means it was not sent. */
		sentAt: timestampMs('sent_at'),
		/** System-written rows (status changes), as `form_submission_notes` does it. */
		isSystem: integer('is_system', { mode: 'boolean' }).default(false).notNull(),
		...publicFields
	},
	(table) => [
		index('contact_message_replies_message_idx').on(table.contactMessageId, table.createdAt)
	]
);

/**
 * Where the Foundation physically is.
 *
 * A row rather than the `contact.address` setting, because §1 expects
 * expansion beyond Addis within a few years and "our offices" is then a list.
 * The settings keys stay as the fallback for a site with no office rows.
 */
export const contactOffices = sqliteTable(
	'contact_offices',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		name: text('name').notNull(),
		nameAm: text('name_am'),
		addressLine: text('address_line'),
		city: text('city'),
		regionId: integer('region_id').references(() => regions.id, { onDelete: 'set null' }),
		phone: text('phone'),
		email: text('email'),
		openingHours: text('opening_hours'),
		/** A maps link staff paste in; rendered as a link, never as an embed. */
		mapUrl: text('map_url'),
		/** The one shown first, and the one a single-office site displays. */
		isPrimary: integer('is_primary', { mode: 'boolean' }).default(false).notNull(),
		sortOrder: integer('sort_order').default(0).notNull(),
		...secureFields
	},
	(table) => [index('contact_offices_active_idx').on(table.isActive, table.sortOrder)]
);

/* ==========================================================================
   3.7b NEWSLETTER
   ========================================================================== */

export const newsletterSubscribers = sqliteTable(
	'newsletter_subscribers',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		email: text('email').notNull().unique(),
		name: text('name'),
		preferredLanguage: text('preferred_language', { enum: ['en', 'am'] })
			.default('en')
			.notNull(),
		subscribedAt: timestampMs('subscribed_at').default(nowMs).notNull(),
		unsubscribedAt: timestampMs('unsubscribed_at'),
		isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
		source: text('source', {
			enum: ['homepage', 'donation_flow', 'manual', 'footer', 'contact_form']
		})
			.default('homepage')
			.notNull(),
		/** Single-use token in the unsubscribe link, so nobody unsubscribes by id. */
		unsubscribeToken: text('unsubscribe_token').notNull().unique(),
		createdAt: timestampMs('created_at').default(nowMs).notNull()
	},
	(table) => [index('newsletter_active_idx').on(table.isActive)]
);

/* ==========================================================================
   3.11 AUDIT LOG
   ========================================================================== */

/**
 * Every read and write touching `form_submissions`, `beneficiaries`,
 * `volunteer_applications` and their notes/documents writes a row here. This
 * is non-negotiable given the medical and mental-health-adjacent data — see
 * §3.11. Writes go through `$lib/server/audit`, which is the only place that
 * inserts into this table.
 */
export const auditLog = sqliteTable(
	'audit_log',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		/** e.g. `viewed_case`, `updated_status`, `exported_data`, `edited_content_block`. */
		action: text('action').notNull(),
		entityType: text('entity_type').notNull(),
		entityId: text('entity_id'),
		metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		createdAt: timestampMs('created_at').default(nowMs).notNull()
	},
	(table) => [
		index('audit_log_entity_idx').on(table.entityType, table.entityId, table.createdAt),
		index('audit_log_user_idx').on(table.userId, table.createdAt),
		index('audit_log_created_idx').on(table.createdAt)
	]
);

/* ==========================================================================
   4. IMPACT METRICS — computed, not entered
   ========================================================================== */

/**
 * A cache, never a source of truth. The homepage counters are computed from
 * `beneficiaries`, `form_submissions` and `donations` on a schedule; staff can
 * still publish a manually-verified figure through the `impact.override_*`
 * site settings, which the renderer prefers when present.
 */
export const impactMetricsCache = sqliteTable(
	'impact_metrics_cache',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** e.g. `families_supported`, `students_sponsored`, `funds_raised`. */
		key: text('key').notNull(),
		/** Null for the all-Foundation figure; set for a per-pillar breakdown. */
		pillarId: integer('pillar_id').references(() => pillars.id, { onDelete: 'cascade' }),
		regionId: integer('region_id').references(() => regions.id, { onDelete: 'cascade' }),
		value: integer('value').default(0).notNull(),
		/** Set for money metrics; null for counts. */
		currency: text('currency'),
		computedAt: timestampMs('computed_at').default(nowMs).notNull()
	},
	(table) => [
		/**
		 * Deliberately a plain index, not a unique one.
		 *
		 * The obvious `unique(key, pillar_id, region_id)` does not do what it
		 * looks like: SQLite treats NULLs as distinct in a unique index, so the
		 * all-Foundation rows — which carry null in both foreign keys — would not
		 * be constrained at all, and an upsert targeting it would silently insert
		 * duplicates on every recompute. (That bug was real here before this
		 * comment existed.)
		 *
		 * Uniqueness is instead guaranteed by how the table is written:
		 * `recomputeImpactMetrics` replaces the whole set inside one transaction.
		 * This index exists for the read path, which looks rows up by key.
		 */
		index('impact_metrics_key_idx').on(table.key, table.pillarId, table.regionId)
	]
);

/* ==========================================================================
   RELATIONS
   ========================================================================== */

export const pillarsRelations = relations(pillars, ({ many }) => ({
	formDefinitions: many(formDefinitions),
	submissions: many(formSubmissions),
	assignments: many(userPillarAssignments)
}));

export const pagesRelations = relations(pages, ({ many }) => ({
	blocks: many(contentBlocks),
	navigationItems: many(navigationItems)
}));

export const contentBlocksRelations = relations(contentBlocks, ({ one }) => ({
	page: one(pages, { fields: [contentBlocks.pageId], references: [pages.id] })
}));

export const navigationItemsRelations = relations(navigationItems, ({ one }) => ({
	page: one(pages, { fields: [navigationItems.pageId], references: [pages.id] })
}));

export const formDefinitionsRelations = relations(formDefinitions, ({ one, many }) => ({
	pillar: one(pillars, { fields: [formDefinitions.pillarId], references: [pillars.id] }),
	fields: many(formFields),
	submissions: many(formSubmissions)
}));

export const formFieldsRelations = relations(formFields, ({ one }) => ({
	form: one(formDefinitions, {
		fields: [formFields.formDefinitionId],
		references: [formDefinitions.id]
	})
}));

export const formSubmissionsRelations = relations(formSubmissions, ({ one, many }) => ({
	form: one(formDefinitions, {
		fields: [formSubmissions.formDefinitionId],
		references: [formDefinitions.id]
	}),
	status: one(statusOptions, {
		fields: [formSubmissions.statusId],
		references: [statusOptions.id]
	}),
	pillar: one(pillars, { fields: [formSubmissions.pillarId], references: [pillars.id] }),
	beneficiary: one(beneficiaries, {
		fields: [formSubmissions.submittedByBeneficiaryId],
		references: [beneficiaries.id]
	}),
	reviewer: one(user, { fields: [formSubmissions.assignedReviewerId], references: [user.id] }),
	region: one(regions, { fields: [formSubmissions.regionId], references: [regions.id] }),
	documents: many(formSubmissionDocuments),
	notes: many(formSubmissionNotes),
	disbursements: many(disbursements)
}));

export const formSubmissionDocumentsRelations = relations(formSubmissionDocuments, ({ one }) => ({
	submission: one(formSubmissions, {
		fields: [formSubmissionDocuments.formSubmissionId],
		references: [formSubmissions.id]
	}),
	file: one(files, { fields: [formSubmissionDocuments.fileId], references: [files.id] })
}));

export const formSubmissionNotesRelations = relations(formSubmissionNotes, ({ one }) => ({
	submission: one(formSubmissions, {
		fields: [formSubmissionNotes.formSubmissionId],
		references: [formSubmissions.id]
	}),
	author: one(user, { fields: [formSubmissionNotes.authorId], references: [user.id] })
}));

export const beneficiariesRelations = relations(beneficiaries, ({ one, many }) => ({
	household: one(households, {
		fields: [beneficiaries.householdId],
		references: [households.id]
	}),
	region: one(regions, { fields: [beneficiaries.regionId], references: [regions.id] }),
	submissions: many(formSubmissions),
	disbursements: many(disbursements)
}));

export const householdsRelations = relations(households, ({ one, many }) => ({
	region: one(regions, { fields: [households.regionId], references: [regions.id] }),
	members: many(beneficiaries)
}));

export const disbursementsRelations = relations(disbursements, ({ one }) => ({
	submission: one(formSubmissions, {
		fields: [disbursements.formSubmissionId],
		references: [formSubmissions.id]
	}),
	beneficiary: one(beneficiaries, {
		fields: [disbursements.beneficiaryId],
		references: [beneficiaries.id]
	}),
	pillar: one(pillars, { fields: [disbursements.pillarId], references: [pillars.id] })
}));

export const donorsRelations = relations(donors, ({ many }) => ({
	donations: many(donations),
	pledges: many(recurringPledges),
	inKindDonations: many(inKindDonations)
}));

export const donationsRelations = relations(donations, ({ one, many }) => ({
	donor: one(donors, { fields: [donations.donorId], references: [donors.id] }),
	pillar: one(pillars, { fields: [donations.designationPillarId], references: [pillars.id] }),
	initiative: one(futureInitiatives, {
		fields: [donations.designationInitiativeId],
		references: [futureInitiatives.id]
	}),
	paymentMethod: one(paymentMethods, {
		fields: [donations.paymentMethodId],
		references: [paymentMethods.id]
	}),
	paymentAccount: one(paymentAccounts, {
		fields: [donations.paymentAccountId],
		references: [paymentAccounts.id]
	}),
	pledge: one(recurringPledges, {
		fields: [donations.recurringPledgeId],
		references: [recurringPledges.id]
	}),
	reconciliations: many(donationReconciliationLog)
}));

export const recurringPledgesRelations = relations(recurringPledges, ({ one, many }) => ({
	donor: one(donors, { fields: [recurringPledges.donorId], references: [donors.id] }),
	donations: many(donations)
}));

export const inKindCategoriesRelations = relations(inKindCategories, ({ one, many }) => ({
	pillar: one(pillars, { fields: [inKindCategories.pillarId], references: [pillars.id] }),
	items: many(inKindDonationItems)
}));

export const inKindDonationsRelations = relations(inKindDonations, ({ one, many }) => ({
	donor: one(donors, { fields: [inKindDonations.donorId], references: [donors.id] }),
	pillar: one(pillars, { fields: [inKindDonations.designationPillarId], references: [pillars.id] }),
	initiative: one(futureInitiatives, {
		fields: [inKindDonations.designationInitiativeId],
		references: [futureInitiatives.id]
	}),
	region: one(regions, { fields: [inKindDonations.regionId], references: [regions.id] }),
	reviewer: one(user, { fields: [inKindDonations.reviewedById], references: [user.id] }),
	assignee: one(user, { fields: [inKindDonations.assignedToId], references: [user.id] }),
	receivedBy: one(user, { fields: [inKindDonations.receivedById], references: [user.id] }),
	items: many(inKindDonationItems),
	photos: many(inKindDonationPhotos)
}));

export const inKindDonationItemsRelations = relations(inKindDonationItems, ({ one }) => ({
	donation: one(inKindDonations, {
		fields: [inKindDonationItems.inKindDonationId],
		references: [inKindDonations.id]
	}),
	category: one(inKindCategories, {
		fields: [inKindDonationItems.categoryId],
		references: [inKindCategories.id]
	})
}));

export const inKindDonationPhotosRelations = relations(inKindDonationPhotos, ({ one }) => ({
	donation: one(inKindDonations, {
		fields: [inKindDonationPhotos.inKindDonationId],
		references: [inKindDonations.id]
	}),
	file: one(files, { fields: [inKindDonationPhotos.fileId], references: [files.id] }),
	item: one(inKindDonationItems, {
		fields: [inKindDonationPhotos.itemId],
		references: [inKindDonationItems.id]
	})
}));

export const donationReconciliationLogRelations = relations(
	donationReconciliationLog,
	({ one }) => ({
		donation: one(donations, {
			fields: [donationReconciliationLog.donationId],
			references: [donations.id]
		}),
		matchedByUser: one(user, {
			fields: [donationReconciliationLog.matchedBy],
			references: [user.id]
		})
	})
);

export const paymentMethodsRelations = relations(paymentMethods, ({ many }) => ({
	accounts: many(paymentAccounts)
}));

export const paymentAccountsRelations = relations(paymentAccounts, ({ one }) => ({
	method: one(paymentMethods, {
		fields: [paymentAccounts.paymentMethodId],
		references: [paymentMethods.id]
	})
}));

export const volunteerApplicationsRelations = relations(volunteerApplications, ({ one, many }) => ({
	status: one(statusOptions, {
		fields: [volunteerApplications.statusId],
		references: [statusOptions.id]
	}),
	region: one(regions, { fields: [volunteerApplications.regionId], references: [regions.id] }),
	reviewer: one(user, {
		fields: [volunteerApplications.assignedReviewerId],
		references: [user.id]
	}),
	checks: many(volunteerSafeguardingChecks),
	placements: many(volunteerPlacements),
	skills: many(volunteerApplicationSkills),
	availability: many(volunteerAvailability),
	credentials: many(volunteerCredentials),
	references: many(volunteerReferences),
	interests: many(volunteerInterests)
}));

export const volunteerSafeguardingChecksRelations = relations(
	volunteerSafeguardingChecks,
	({ one }) => ({
		application: one(volunteerApplications, {
			fields: [volunteerSafeguardingChecks.volunteerApplicationId],
			references: [volunteerApplications.id]
		}),
		item: one(volunteerSafeguardingChecklistItems, {
			fields: [volunteerSafeguardingChecks.checklistItemId],
			references: [volunteerSafeguardingChecklistItems.id]
		})
	})
);

export const volunteerSkillCategoriesRelations = relations(
	volunteerSkillCategories,
	({ many }) => ({ skills: many(volunteerSkills) })
);

export const volunteerSkillsRelations = relations(volunteerSkills, ({ one, many }) => ({
	category: one(volunteerSkillCategories, {
		fields: [volunteerSkills.categoryId],
		references: [volunteerSkillCategories.id]
	}),
	claims: many(volunteerApplicationSkills)
}));

export const volunteerApplicationSkillsRelations = relations(
	volunteerApplicationSkills,
	({ one }) => ({
		application: one(volunteerApplications, {
			fields: [volunteerApplicationSkills.volunteerApplicationId],
			references: [volunteerApplications.id]
		}),
		skill: one(volunteerSkills, {
			fields: [volunteerApplicationSkills.skillId],
			references: [volunteerSkills.id]
		})
	})
);

export const volunteerTimeSlotsRelations = relations(volunteerTimeSlots, ({ many }) => ({
	availability: many(volunteerAvailability)
}));

export const volunteerAvailabilityRelations = relations(volunteerAvailability, ({ one }) => ({
	application: one(volunteerApplications, {
		fields: [volunteerAvailability.volunteerApplicationId],
		references: [volunteerApplications.id]
	}),
	timeSlot: one(volunteerTimeSlots, {
		fields: [volunteerAvailability.timeSlotId],
		references: [volunteerTimeSlots.id]
	})
}));

export const volunteerProfessionsRelations = relations(volunteerProfessions, ({ many }) => ({
	credentials: many(volunteerCredentials)
}));

export const volunteerCredentialsRelations = relations(volunteerCredentials, ({ one }) => ({
	application: one(volunteerApplications, {
		fields: [volunteerCredentials.volunteerApplicationId],
		references: [volunteerApplications.id]
	}),
	profession: one(volunteerProfessions, {
		fields: [volunteerCredentials.professionId],
		references: [volunteerProfessions.id]
	}),
	document: one(files, {
		fields: [volunteerCredentials.documentFileId],
		references: [files.id]
	}),
	verifier: one(user, { fields: [volunteerCredentials.verifiedBy], references: [user.id] })
}));

export const volunteerReferencesRelations = relations(volunteerReferences, ({ one }) => ({
	application: one(volunteerApplications, {
		fields: [volunteerReferences.volunteerApplicationId],
		references: [volunteerApplications.id]
	}),
	contactedByUser: one(user, {
		fields: [volunteerReferences.contactedBy],
		references: [user.id]
	})
}));

export const volunteerInterestsRelations = relations(volunteerInterests, ({ one }) => ({
	application: one(volunteerApplications, {
		fields: [volunteerInterests.volunteerApplicationId],
		references: [volunteerApplications.id]
	}),
	pillar: one(pillars, { fields: [volunteerInterests.pillarId], references: [pillars.id] })
}));

export const languagesRelations = relations(languages, ({ many }) => ({
	subjects: many(applicationSubjects),
	beneficiaries: many(beneficiaries)
}));

export const assistanceNeedCategoriesRelations = relations(
	assistanceNeedCategories,
	({ many }) => ({ needs: many(assistanceNeeds) })
);

export const assistanceNeedsRelations = relations(assistanceNeeds, ({ one, many }) => ({
	category: one(assistanceNeedCategories, {
		fields: [assistanceNeeds.categoryId],
		references: [assistanceNeedCategories.id]
	}),
	pillar: one(pillars, { fields: [assistanceNeeds.pillarId], references: [pillars.id] }),
	claims: many(applicationNeeds)
}));

export const applicationSubjectsRelations = relations(applicationSubjects, ({ one }) => ({
	submission: one(formSubmissions, {
		fields: [applicationSubjects.formSubmissionId],
		references: [formSubmissions.id]
	}),
	region: one(regions, { fields: [applicationSubjects.regionId], references: [regions.id] }),
	writtenLanguage: one(languages, {
		fields: [applicationSubjects.writtenLanguageId],
		references: [languages.id]
	})
}));

export const applicationNeedsRelations = relations(applicationNeeds, ({ one }) => ({
	submission: one(formSubmissions, {
		fields: [applicationNeeds.formSubmissionId],
		references: [formSubmissions.id]
	}),
	need: one(assistanceNeeds, {
		fields: [applicationNeeds.needId],
		references: [assistanceNeeds.id]
	})
}));

export const contactSubjectsRelations = relations(contactSubjects, ({ one, many }) => ({
	defaultAssignee: one(user, {
		fields: [contactSubjects.defaultAssigneeId],
		references: [user.id]
	}),
	suggestedPillar: one(pillars, {
		fields: [contactSubjects.suggestedPillarId],
		references: [pillars.id]
	}),
	messages: many(contactMessages)
}));

export const contactMessagesRelations = relations(contactMessages, ({ one, many }) => ({
	subject: one(contactSubjects, {
		fields: [contactMessages.subjectId],
		references: [contactSubjects.id]
	}),
	status: one(statusOptions, {
		fields: [contactMessages.statusId],
		references: [statusOptions.id]
	}),
	assignee: one(user, { fields: [contactMessages.assignedToId], references: [user.id] }),
	region: one(regions, { fields: [contactMessages.regionId], references: [regions.id] }),
	replies: many(contactMessageReplies)
}));

export const contactMessageRepliesRelations = relations(contactMessageReplies, ({ one }) => ({
	message: one(contactMessages, {
		fields: [contactMessageReplies.contactMessageId],
		references: [contactMessages.id]
	}),
	author: one(user, { fields: [contactMessageReplies.authorId], references: [user.id] })
}));

export const contactOfficesRelations = relations(contactOffices, ({ one }) => ({
	region: one(regions, { fields: [contactOffices.regionId], references: [regions.id] })
}));

export const volunteerPlacementsRelations = relations(volunteerPlacements, ({ one }) => ({
	application: one(volunteerApplications, {
		fields: [volunteerPlacements.volunteerApplicationId],
		references: [volunteerApplications.id]
	}),
	pillar: one(pillars, { fields: [volunteerPlacements.pillarId], references: [pillars.id] })
}));

export const userPillarAssignmentsRelations = relations(userPillarAssignments, ({ one }) => ({
	user: one(user, { fields: [userPillarAssignments.userId], references: [user.id] }),
	pillar: one(pillars, { fields: [userPillarAssignments.pillarId], references: [pillars.id] })
}));

export const filesRelations = relations(files, ({ one }) => ({
	uploader: one(user, { fields: [files.uploadedBy], references: [user.id] }),
	pillar: one(pillars, { fields: [files.pillarId], references: [pillars.id] })
}));

export const regionsRelations = relations(regions, ({ many }) => ({
	submissions: many(formSubmissions),
	beneficiaries: many(beneficiaries)
}));

export const blogCategoriesRelations = relations(blogCategories, ({ many }) => ({
	posts: many(blogPosts)
}));

export const blogPostsRelations = relations(blogPosts, ({ one }) => ({
	category: one(blogCategories, {
		fields: [blogPosts.categoryId],
		references: [blogCategories.id]
	})
}));

export const mediaItemsRelations = relations(mediaItems, ({ one }) => ({
	file: one(files, { fields: [mediaItems.fileId], references: [files.id] })
}));

export const testimonialsRelations = relations(testimonials, ({ one }) => ({
	pillar: one(pillars, { fields: [testimonials.pillarId], references: [pillars.id] })
}));
