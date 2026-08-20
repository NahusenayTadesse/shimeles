/**
 * Emits a standalone seeder for the volunteer, apply and contact catalogues.
 *
 * Production must not have the whole seed run against it — that would insert
 * blog posts, testimonials and media the Foundation has not asked for. This
 * takes only the configuration rows the three new public pages cannot render
 * without: the skills and shifts a volunteer picks from, the kinds of help and
 * languages on the apply form, the enquiry topics on the contact form, and the
 * workflow statuses a contact message needs to have one.
 *
 * Every foreign key is emitted as a **slug, not an id**. The local and
 * production databases were seeded independently and their `pillars.id` values
 * are not guaranteed to line up; copying raw ids across would file "school
 * fees" against whichever programme happened to hold that number. The
 * generated script resolves each one on the server.
 *
 * Idempotent by construction: every insert is keyed on the row's natural key
 * and skipped when it already exists, so re-running adds what is missing and
 * overwrites nothing a staff member has since edited.
 *
 *   node scripts/make-catalog-seed.mjs   # writes deploy/seed-catalog.mjs
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const db = new Database(url, { readonly: true });

/** Resolves a foreign key to the slug of the row it points at. */
const slugFor = (table, id) => {
	if (id === null || id === undefined) return null;
	const row = db.prepare(`select slug from ${table} where id = ?`).get(id);
	return row?.slug ?? null;
};

const rows = (sql) => db.prepare(sql).all();

/* ==========================================================================
   Collect
   ========================================================================== */

const payload = {
	// Contact messages need a status vocabulary or they land with none.
	contactStatuses: rows(
		`select stage, label, color, is_default, sort_order
		 from status_options where context = 'contact' order by sort_order`
	),

	volunteerSkillCategories: rows(
		`select slug, name, description, icon, sort_order
		 from volunteer_skill_categories where deleted_at is null order by sort_order`
	),

	volunteerSkills: rows(
		`select slug, name, description, hint, requires_credential, category_id, sort_order
		 from volunteer_skills where deleted_at is null order by sort_order`
	).map((row) => ({
		...row,
		category_id: undefined,
		category_slug: slugFor('volunteer_skill_categories', row.category_id)
	})),

	volunteerTimeSlots: rows(
		`select slug, label, day_of_week, start_time, end_time, description, sort_order
		 from volunteer_time_slots where deleted_at is null order by sort_order`
	),

	volunteerProfessions: rows(
		`select slug, name, category, requires_license, default_licensing_body, description, sort_order
		 from volunteer_professions where deleted_at is null order by sort_order`
	),

	languages: rows(
		`select slug, name, native_name, sort_order
		 from languages where deleted_at is null order by sort_order`
	),

	needCategories: rows(
		`select slug, name, description, icon, sort_order
		 from assistance_need_categories where deleted_at is null order by sort_order`
	),

	needs: rows(
		`select slug, name, description, evidence_hint, category_id, pillar_id, sort_order
		 from assistance_needs where deleted_at is null order by sort_order`
	).map((row) => ({
		...row,
		category_id: undefined,
		pillar_id: undefined,
		category_slug: slugFor('assistance_need_categories', row.category_id),
		pillar_slug: slugFor('pillars', row.pillar_id)
	})),

	contactSubjects: rows(
		`select slug, name, description, icon, target_response_hours, public_response_note,
		        suggested_pillar_id, sort_order
		 from contact_subjects where deleted_at is null order by sort_order`
	).map((row) => ({
		...row,
		suggested_pillar_id: undefined,
		suggested_pillar_slug: slugFor('pillars', row.suggested_pillar_id)
	})),

	// The general application form. `form_submissions.form_definition_id` is
	// NOT NULL, so an application naming no programme has nowhere to go without
	// this row.
	generalForm: db
		.prepare(
			`select slug, name, title, intro_text, success_message, requires_documents,
			        is_low_barrier, reference_prefix, status_context, sort_order
			 from form_definitions where slug = 'assistance-application'`
		)
		.get(),

	applyPage: db
		.prepare(
			`select slug, title, meta_description, is_published, sort_order
			 from pages where slug = 'apply'`
		)
		.get()
};

// The apply page's intro copy and its navigation entry, both keyed to the page.
const applyPageId = db.prepare(`select id from pages where slug = 'apply'`).get()?.id;

payload.applyBlocks = applyPageId
	? rows(
			`select block_type, heading, content, sort_order, is_published
			 from content_blocks where page_id = ${applyPageId} and deleted_at is null
			 order by sort_order`
		)
	: [];

payload.applyNav = applyPageId
	? rows(
			`select label, placement, is_cta, sort_order
			 from navigation_items where page_id = ${applyPageId} and deleted_at is null`
		)
	: [];

/* ==========================================================================
   Sanity — a silent empty payload would deploy a broken page
   ========================================================================== */

const expected = {
	contactStatuses: 1,
	volunteerSkillCategories: 1,
	volunteerSkills: 10,
	volunteerTimeSlots: 5,
	volunteerProfessions: 5,
	languages: 3,
	needCategories: 1,
	needs: 10,
	contactSubjects: 3
};

for (const [key, min] of Object.entries(expected)) {
	if (!payload[key] || payload[key].length < min) {
		throw new Error(`expected at least ${min} ${key} locally, found ${payload[key]?.length ?? 0}`);
	}
}
if (!payload.generalForm) throw new Error('the assistance-application form definition is missing');
if (!payload.applyPage) throw new Error('the apply page row is missing');

/* ==========================================================================
   Emit
   ========================================================================== */

const script = `/**
 * Seeds the volunteer, apply and contact catalogues on the server.
 *
 * GENERATED by scripts/make-catalog-seed.mjs — do not edit by hand.
 *
 * Configuration rows only: the skills, shifts, professions, kinds of help,
 * languages and enquiry topics the three new public pages are built from,
 * plus the workflow statuses a contact message needs and the general
 * application form definition. No blog posts, testimonials or media.
 *
 * Idempotent. Every insert is keyed on the row's natural key and skipped when
 * it is already there, so re-running adds what is missing and overwrites
 * nothing anyone has edited since.
 *
 *   node seed-catalog.mjs
 */
import Database from 'better-sqlite3';

const db = new Database('local.db');
db.pragma('foreign_keys = ON');

const data = ${JSON.stringify(payload, null, '\t')};

const now = () => Date.now();
let added = 0;
let skipped = 0;
let retagged = 0;

/** Inserts when the natural key is absent; reports either way. */
const upsert = (table, key, keyValue, values) => {
	const existing = db.prepare(\`select id from \${table} where \${key} = ?\`).get(keyValue);
	if (existing) {
		skipped++;
		return existing.id;
	}
	const columns = Object.keys(values);
	const placeholders = columns.map(() => '?').join(', ');
	const info = db
		.prepare(\`insert into \${table} (\${columns.join(', ')}) values (\${placeholders})\`)
		.run(...columns.map((column) => values[column]));
	added++;
	return info.lastInsertRowid;
};

const idBySlug = (table, slug) =>
	slug ? (db.prepare(\`select id from \${table} where slug = ?\`).get(slug)?.id ?? null) : null;

db.transaction(() => {
	/* --- Contact workflow statuses ------------------------------------- */
	for (const row of data.contactStatuses) {
		const existing = db
			.prepare("select id from status_options where context = 'contact' and stage = ?")
			.get(row.stage);
		if (existing) {
			skipped++;
			continue;
		}
		db.prepare(
			\`insert into status_options (context, stage, label, color, is_default, sort_order,
			                             is_active, created_at, updated_at)
			 values ('contact', ?, ?, ?, ?, ?, 1, ?, ?)\`
		).run(row.stage, row.label, row.color, row.is_default, row.sort_order, now(), now());
		added++;
	}

	/* --- Volunteer catalogue -------------------------------------------- */
	for (const row of data.volunteerSkillCategories) {
		upsert('volunteer_skill_categories', 'slug', row.slug, {
			slug: row.slug,
			name: row.name,
			description: row.description,
			icon: row.icon,
			sort_order: row.sort_order,
			is_active: 1,
			created_at: now(),
			updated_at: now()
		});
	}

	for (const row of data.volunteerSkills) {
		upsert('volunteer_skills', 'slug', row.slug, {
			slug: row.slug,
			name: row.name,
			description: row.description,
			hint: row.hint,
			requires_credential: row.requires_credential,
			category_id: idBySlug('volunteer_skill_categories', row.category_slug),
			sort_order: row.sort_order,
			is_active: 1,
			created_at: now(),
			updated_at: now()
		});
	}

	for (const row of data.volunteerTimeSlots) {
		upsert('volunteer_time_slots', 'slug', row.slug, {
			slug: row.slug,
			label: row.label,
			day_of_week: row.day_of_week,
			start_time: row.start_time,
			end_time: row.end_time,
			description: row.description,
			sort_order: row.sort_order,
			is_active: 1,
			created_at: now(),
			updated_at: now()
		});
	}

	for (const row of data.volunteerProfessions) {
		upsert('volunteer_professions', 'slug', row.slug, {
			slug: row.slug,
			name: row.name,
			category: row.category,
			requires_license: row.requires_license,
			default_licensing_body: row.default_licensing_body,
			description: row.description,
			sort_order: row.sort_order,
			is_active: 1,
			created_at: now(),
			updated_at: now()
		});
	}

	/* --- Apply catalogue -------------------------------------------------- */
	for (const row of data.languages) {
		upsert('languages', 'slug', row.slug, {
			slug: row.slug,
			name: row.name,
			native_name: row.native_name,
			sort_order: row.sort_order,
			is_active: 1,
			created_at: now(),
			updated_at: now()
		});
	}

	for (const row of data.needCategories) {
		upsert('assistance_need_categories', 'slug', row.slug, {
			slug: row.slug,
			name: row.name,
			description: row.description,
			icon: row.icon,
			sort_order: row.sort_order,
			is_active: 1,
			created_at: now(),
			updated_at: now()
		});
	}

	for (const row of data.needs) {
		upsert('assistance_needs', 'slug', row.slug, {
			slug: row.slug,
			name: row.name,
			description: row.description,
			evidence_hint: row.evidence_hint,
			category_id: idBySlug('assistance_need_categories', row.category_slug),
			// Resolved on this database. A pillar that does not exist here leaves
			// the need unrouted rather than pointing it at the wrong programme.
			pillar_id: idBySlug('pillars', row.pillar_slug),
			sort_order: row.sort_order,
			is_active: 1,
			created_at: now(),
			updated_at: now()
		});
	}

	/* --- Contact catalogue ------------------------------------------------- */
	for (const row of data.contactSubjects) {
		upsert('contact_subjects', 'slug', row.slug, {
			slug: row.slug,
			name: row.name,
			description: row.description,
			icon: row.icon,
			target_response_hours: row.target_response_hours,
			public_response_note: row.public_response_note,
			suggested_pillar_id: idBySlug('pillars', row.suggested_pillar_slug),
			sort_order: row.sort_order,
			is_active: 1,
			created_at: now(),
			updated_at: now()
		});
	}

	/* --- The general application form --------------------------------------- */
	const form = data.generalForm;
	upsert('form_definitions', 'slug', form.slug, {
		slug: form.slug,
		name: form.name,
		title: form.title,
		intro_text: form.intro_text,
		success_message: form.success_message,
		requires_documents: form.requires_documents,
		is_low_barrier: form.is_low_barrier,
		reference_prefix: form.reference_prefix,
		status_context: form.status_context,
		sort_order: form.sort_order,
		is_active: 1,
		created_at: now(),
		updated_at: now()
	});

	/* --- The apply page, its intro copy and its nav entry ---------------------- */
	const page = data.applyPage;
	const pageId = upsert('pages', 'slug', page.slug, {
		slug: page.slug,
		title: page.title,
		meta_description: page.meta_description,
		is_published: page.is_published,
		sort_order: page.sort_order,
		is_active: 1,
		created_at: now(),
		updated_at: now()
	});

	for (const block of data.applyBlocks) {
		const existing = db
			.prepare('select id from content_blocks where page_id = ? and sort_order = ?')
			.get(pageId, block.sort_order);
		if (existing) {
			skipped++;
			continue;
		}
		db.prepare(
			\`insert into content_blocks (page_id, block_type, heading, content, sort_order,
			                             is_published, is_active, created_at, updated_at)
			 values (?, ?, ?, ?, ?, ?, 1, ?, ?)\`
		).run(
			pageId,
			block.block_type,
			block.heading,
			block.content,
			block.sort_order,
			block.is_published,
			now(),
			now()
		);
		added++;
	}

	/* --- Retag messages migration 0012 carried over ---------------------------
	   The old contact form stored a slug like "partner" in what is now
	   \`subject_other\`. Most line up with a topic seeded above; anything that
	   does not keeps its free text rather than being forced into a wrong one. */
	const legacyTopics = {
		general: 'general',
		donate: 'donating',
		partner: 'partnership',
		press: 'press',
		other: 'other'
	};

	for (const [oldValue, newSlug] of Object.entries(legacyTopics)) {
		const subjectId = idBySlug('contact_subjects', newSlug);
		if (!subjectId) continue;
		const info = db
			.prepare(
				'update contact_messages set subject_id = ?, subject_other = null ' +
					'where subject_id is null and subject_other = ?'
			)
			.run(subjectId, oldValue);
		retagged += info.changes;
	}

	/* --- Give migrated messages a status ---------------------------------------
	   0012 leaves \`status_id\` null on purpose: the status they had belonged to
	   the application vocabulary and would be the wrong words here. */
	const defaultContactStatus = db
		.prepare("select id from status_options where context = 'contact' and is_default = 1")
		.get();
	if (defaultContactStatus) {
		const info = db
			.prepare('update contact_messages set status_id = ? where status_id is null')
			.run(defaultContactStatus.id);
		retagged += info.changes;
	}

	for (const item of data.applyNav) {
		const existing = db
			.prepare('select id from navigation_items where page_id = ? and placement = ?')
			.get(pageId, item.placement);
		if (existing) {
			skipped++;
			continue;
		}
		db.prepare(
			\`insert into navigation_items (label, page_id, placement, is_cta, sort_order,
			                               is_active, created_at, updated_at)
			 values (?, ?, ?, ?, ?, 1, ?, ?)\`
		).run(item.label, pageId, item.placement, item.is_cta, item.sort_order, now(), now());
		added++;
	}
})();

console.log(
	\`catalogue seed: \${added} rows added, \${skipped} already present, \${retagged} messages retagged\`
);
db.close();
`;

const out = path.join(process.cwd(), 'deploy', 'seed-catalog.mjs');
fs.writeFileSync(out, script);
console.log(`wrote ${out}`);
console.log(
	`  ${payload.volunteerSkills.length} skills, ${payload.volunteerTimeSlots.length} time slots, ` +
		`${payload.volunteerProfessions.length} professions`
);
console.log(
	`  ${payload.needs.length} kinds of help, ${payload.languages.length} languages, ` +
		`${payload.contactSubjects.length} enquiry topics, ${payload.contactStatuses.length} statuses`
);
db.close();
