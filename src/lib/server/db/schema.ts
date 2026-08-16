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
				'memoriam'
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
		context: text('context', { enum: ['application', 'volunteer', 'donation'] })
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

/** The photo gallery under the In Memoriam section. Ordered, captioned. */
export const aboutGalleryImages = sqliteTable(
	'about_gallery_images',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		fileId: integer('file_id')
			.notNull()
			.references(() => files.id, { onDelete: 'cascade' }),
		caption: text('caption'),
		sortOrder: integer('sort_order').default(0).notNull(),
		createdAt: timestampMs('created_at').default(nowMs).notNull()
	},
	(table) => [index('about_gallery_sort_idx').on(table.sortOrder)]
);

/**
 * The homepage hero's photo gallery — replaces the old single `hero.image`
 * setting with an ordered, captioned set the header rotates through. Shaped
 * exactly like `about_gallery_images` so `$lib/components/GalleryUpload` and
 * the same dashboard CRUD pattern work unchanged.
 */
export const heroGalleryImages = sqliteTable(
	'hero_gallery_images',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		fileId: integer('file_id')
			.notNull()
			.references(() => files.id, { onDelete: 'cascade' }),
		caption: text('caption'),
		sortOrder: integer('sort_order').default(0).notNull(),
		createdAt: timestampMs('created_at').default(nowMs).notNull()
	},
	(table) => [index('hero_gallery_sort_idx').on(table.sortOrder)]
);

/**
 * A general photo section further down the homepage — moments from the
 * programmes, distinct from the hero collage at the top. Same shape again,
 * same reason: the dashboard CRUD and the public `Gallery` component both
 * already know how to work with a table like this.
 */
export const homepageGalleryImages = sqliteTable(
	'homepage_gallery_images',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		fileId: integer('file_id')
			.notNull()
			.references(() => files.id, { onDelete: 'cascade' }),
		caption: text('caption'),
		sortOrder: integer('sort_order').default(0).notNull(),
		createdAt: timestampMs('created_at').default(nowMs).notNull()
	},
	(table) => [index('homepage_gallery_sort_idx').on(table.sortOrder)]
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
		/** Array of pillar ids and/or free-text tags. */
		areasOfInterest: text('areas_of_interest', { mode: 'json' }).$type<(number | string)[]>(),
		skills: text('skills', { mode: 'json' }).$type<string[]>(),
		availability: text('availability'),
		/** For medical and mental-health volunteers. */
		professionalCredentials: text('professional_credentials'),
		/** Answers to any extra questions on the volunteer form definition. */
		data: text('data', { mode: 'json' }).$type<Record<string, unknown>>(),
		statusId: integer('status_id').references(() => statusOptions.id, { onDelete: 'set null' }),
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

/* ==========================================================================
   3.7 NEWSLETTER
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
		source: text('source', { enum: ['homepage', 'donation_flow', 'manual', 'footer'] })
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
	pledges: many(recurringPledges)
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
	placements: many(volunteerPlacements)
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

export const aboutGalleryImagesRelations = relations(aboutGalleryImages, ({ one }) => ({
	file: one(files, { fields: [aboutGalleryImages.fileId], references: [files.id] })
}));

export const heroGalleryImagesRelations = relations(heroGalleryImages, ({ one }) => ({
	file: one(files, { fields: [heroGalleryImages.fileId], references: [files.id] })
}));

export const homepageGalleryImagesRelations = relations(homepageGalleryImages, ({ one }) => ({
	file: one(files, { fields: [homepageGalleryImages.fileId], references: [files.id] })
}));
