# Shimeles Abera Foundation — System Technical Specification

## For AI Coding Agent Use — v1 Build

This document is written to be read and executed against by an AI coding agent (e.g. Claude Code). It is self-contained: an agent with no prior context on this project should be able to read this file alone and build a working v1.

---

## 0. Read This First — Core Design Law

**The single governing rule of this build: nothing that a non-technical Foundation staff member might reasonably want to change should be hardcoded.**

Concretely, that means:

- No pillar name, description, or icon is a string literal in a `.svelte` file — it's a row in `pillars`.
- No page's body copy is written into a component — it's `content_blocks` rows rendered by a generic block renderer.
- No form (application, volunteer, contact) has hardcoded fields — each is a `form_definitions` row with a JSON field schema, rendered by a generic form renderer.
- No navigation item, social link, phone number, or footer text is hardcoded — it's `site_settings`.
- No status list (application statuses, volunteer statuses) is a hardcoded enum in the UI layer — it's rows in `status_options`, though the underlying database column _can_ be a constrained enum for integrity (see §3.9).
- Every one of the tables above gets a generic CRUD screen in the dashboard, built from the existing dynamic-table + CRUD-generator toolkit — not a bespoke page per entity.

The test for every decision in this build: **"If the Foundation's program manager wants to change this next year with no developer involved, can they?"** If the answer is no, the design is wrong unless this doc explicitly says otherwise (a small list of things — payment provider keys, the schema shape itself — are deliberately developer-only; see §7).

This is not a request for a headless CMS bolted onto a nonprofit site. It is a request for a nonprofit operations system where the public website is one _view_ of the data, and the dashboard is where the data actually lives and is edited.

---

## 1. Project Context

**Client:** Shimeles Abera Foundation — an Ethiopian nonprofit headquartered in Addis Ababa, founded by the family and friends of Shimeles Abera. Values: Hope, Compassion, Opportunity. Tone: warm and personal, never corporate.

**What the org does today, across four pillars:**

1. **Medical Hardship Support** — financial assistance, access to care, human presence during medical crises.
2. **Elder Care & Assistance** — direct care, dignity, combating isolation.
3. **Mental Wellness** — stigma-free support, low-barrier access, no proof-of-need required.
4. **Youth & Education** — scholarships, mentorship, leadership development, school supplies.

**What the org plans to build (referenced but not operational — display as "planned"):** a free hospital, a network of tuition-free boarding schools, senior citizen centers.

**Ways people currently interact with the Foundation, all of which need a record in the system:** donating (one-time or recurring, general fund or designated), applying for assistance (one form per pillar, each with different requirements), volunteering (application, review, safeguarding check, placement), sponsoring a child or elder (future v2, but data model should not conflict with it), contacting the org.

**Geography:** operates in Addis Ababa today; explicit plan to expand into other regions of Ethiopia within 2–3 years. Every record that could later need a region needs a region field now, even if v1 only ever populates one value.

**Language:** must serve English and Amharic. Assume Amharic (Ge'ez script) content will be entered by staff after launch — don't assume it exists at build time, but every translatable field must have somewhere to put it.

Full narrative detail (mission language, values, exact program descriptions, founding story) is in the companion document `SAF-Website-v1-Scope-and-Features.md`. That document is the source of truth for _copy and tone_; this document is the source of truth for _structure_. Where copy is needed for seed data, pull it from that file rather than inventing new language.

---

## 2. Technology Stack

Use the org's existing toolkit — do not introduce a new stack or reinvent tooling that already exists.

| Layer                 | Choice                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend framework    | Svelte 5 + SvelteKit                                                                                                                                                |
| Styling               | Tailwind CSS                                                                                                                                                        |
| Component library     | shadcn-svelte                                                                                                                                                       |
| Forms                 | Superforms + Zod                                                                                                                                                    |
| ORM                   | Drizzle ORM                                                                                                                                                         |
| Database              | MySQL                                                                                                                                                               |
| Theming               | Full light and dark mode                                                                                                                                            |
| Admin building blocks | The existing reusable toolkit: dynamic tables, filters with charts, query builders, form components, server-side CRUD generators, customizable dashboard components |
| Auth / permissions    | The existing domain-agnostic user management and role/permission system                                                                                             |
| Images                | The existing browser-side image compression system (compress before upload)                                                                                         |
| Files                 | The existing Node.js file management system with caching                                                                                                            |
| Deployment            | SvelteKit build, archived and uploaded via cPanel                                                                                                                   |

**Agent instruction:** before writing any admin CRUD screen, check whether the existing CRUD generator / dynamic table / query builder components can produce it directly from a table + config, rather than hand-building a page. Nearly every entity in §3 should be manageable through the generic CRUD generator with a config object, not a bespoke Svelte page. Reserve custom UI for the handful of screens called out explicitly in §5 (donation reconciliation, case workflow board, form builder) where the generic CRUD grid genuinely isn't enough.

---

## 3. Database Schema

Notation below is descriptive (types + intent), not literal Drizzle syntax — the agent should translate to actual Drizzle MySQL schema definitions, adding `id`, `created_at`, `updated_at` on every table by convention, plus soft-delete (`deleted_at`, nullable) on any table holding user- or beneficiary-submitted data, so nothing is ever hard-deleted by accident.

### 3.1 Configuration & Content (the "everything editable" layer)

**`site_settings`**
Key-value store for every global, singleton value on the site.

- `key` (string, unique) — e.g. `contact.email_primary`, `contact.email_secondary`, `contact.phone_1`, `contact.phone_2`, `social.facebook`, `social.instagram`, `social.tiktok`, `social.youtube`, `social.telegram`, `donation.bank_account_name`, `donation.bank_account_number`, `donation.bank_name`, `hero.headline`, `hero.subheadline`, `impact.override_families_supported` (nullable — manual override of the computed counter)
- `value` (text)
- `value_type` (enum: `text`, `number`, `boolean`, `json`, `image`)
- `label` (string) — human-readable label shown in the dashboard settings screen
- `group` (string) — for grouping in the settings UI, e.g. `contact`, `social`, `donation`, `homepage`
- Dashboard renders one auto-generated settings form per `group`, driven entirely by this table — adding a new setting key should never require a schema migration or new UI code, just a new row.

**`pages`**
One row per top-level public page (Home, About Us, Mission & Vision, Programs, Donate, Volunteer, Contact — plus any added later).

- `slug` (unique)
- `title`
- `title_am` (Amharic)
- `meta_description`, `meta_description_am`
- `is_published` (boolean)
- `sort_order` (int) — controls nav ordering

**`content_blocks`**
The body content of every page, broken into ordered, independently editable blocks — this is what lets staff rewrite a paragraph without touching code.

- `page_id` (FK → pages)
- `block_type` (enum: `rich_text`, `image`, `stat_counter`, `quote`, `cta_button`, `pillar_grid`, `values_list`)
- `sort_order`
- `content` (JSON — shape depends on `block_type`, e.g. rich_text has `{body, body_am}`; cta_button has `{label, label_am, url}`)
- `is_published`

**`navigation_items`**

- `label`, `label_am`
- `url` or `page_id` (FK, nullable — either an internal page or an external/anchor URL)
- `sort_order`
- `is_visible`

**`translations`**
Catch-all for short UI strings that aren't full content blocks (button labels, form field labels, status names, email subject lines).

- `key` (unique, namespaced e.g. `form.submit_button`, `status.under_review`)
- `en`, `am`
  Agent instruction: build a small `t(key)` helper that reads from this table (cached) rather than using a static i18n JSON file, so translation is dashboard-editable, not a code deploy.

### 3.2 Pillars & Programs

**`pillars`**
The four pillars are _data_, not an enum, so a fifth pillar can be added from the dashboard without a code change.

- `slug` (unique)
- `name`, `name_am`
- `description`, `description_am` (rich text)
- `icon` (string — icon identifier)
- `color` (string — theme accent color for this pillar)
- `sort_order`
- `is_active`
- `has_public_application` (boolean — whether an "Apply" form should be shown for this pillar)

**`future_initiatives`**
The hospital, free schools, senior centers.

- `slug`, `name`, `name_am`, `description`, `description_am`
- `status` (enum: `planned`, `in_development`, `active`)
- `sort_order`

### 3.3 Dynamic Forms

This is the mechanism that makes the four different application forms (and the volunteer and contact forms) editable without a developer, per §0.

**`form_definitions`**

- `slug` (unique) — e.g. `application-medical`, `application-elder`, `application-mental-wellness`, `application-youth`, `volunteer-application`, `contact-form`
- `name` — internal label
- `pillar_id` (FK → pillars, nullable — set for the four application forms, null for volunteer/contact)
- `title`, `title_am` (shown to the public)
- `intro_text`, `intro_text_am`
- `requires_documents` (boolean)
- `is_low_barrier` (boolean — flags forms like Mental Wellness where minimal fields and no proof-of-need should be enforced by the generic form validator)
- `is_active`

**`form_fields`**

- `form_definition_id` (FK)
- `field_key` (string, unique within form)
- `label`, `label_am`
- `field_type` (enum: `text`, `textarea`, `number`, `date`, `select`, `multiselect`, `checkbox`, `file_upload`, `phone`, `email`)
- `options` (JSON, nullable — for select/multiselect)
- `is_required`
- `sort_order`
- `validation` (JSON, nullable — passed to Zod schema builder, e.g. `{min, max, pattern}`)

Agent instruction: build one generic Superforms + Zod schema _generator_ that reads a `form_definitions` row and its `form_fields`, builds the Zod schema and the rendered form at request time, and writes submissions into `form_submissions` below. Do not hand-write four separate application forms.

**`form_submissions`**

- `form_definition_id` (FK)
- `reference_number` (unique, human-readable, e.g. `SAF-MED-2026-0142`)
- `data` (JSON — keyed by `field_key`)
- `status_id` (FK → status_options, see §3.9)
- `submitted_by_beneficiary_id` (FK → beneficiaries, nullable — set once a submission is linked to a person)
- `submitted_by_name`, `submitted_by_phone`, `submitted_by_email` (kept even if `is_low_barrier` forms leave these blank)
- `assigned_reviewer_id` (FK → users, nullable)
- `region` (string)

**`form_submission_documents`**

- `form_submission_id` (FK)
- `file_id` (FK → files, see §3.8)
- `label` (string, e.g. "Medical letter", "Income evidence")

**`form_submission_notes`**
Internal case notes — never shown publicly.

- `form_submission_id` (FK)
- `author_id` (FK → users)
- `note` (text)
- `created_at`

### 3.4 Beneficiaries & Disbursements

**`beneficiaries`**
One record per person/household, so returning families are recognized rather than re-entered — this directly satisfies the Foundation's stated continuity-of-care requirement.

- `full_name`
- `phone`, `email` (nullable — Mental Wellness applicants may withhold)
- `household_id` (FK → households, nullable, self-referential grouping for family units)
- `region`
- `notes` (text, internal)

**`households`**

- `label` (e.g. "Abebe family")
- `region`

**`disbursements`**
The record that proves where donations went, tied to a specific case.

- `form_submission_id` (FK)
- `beneficiary_id` (FK)
- `amount`, `currency`
- `paid_to` (string — hospital, school, supplier name)
- `disbursement_date`
- `fund_source` (enum: `general_fund`, `designated`, references `donations.designation_pillar_id` conceptually)
- `recorded_by` (FK → users)

### 3.5 Donations

**`donors`**

- `full_name`, `email`, `phone`
- `is_diaspora` (boolean)
- `preferred_language` (enum: `en`, `am`)
- `lifetime_total` (computed/cached, recalculated on each donation write)

**`donations`**

- `donor_id` (FK)
- `amount`, `currency`
- `frequency` (enum: `one_time`, `monthly`)
- `designation_type` (enum: `general_fund`, `pillar`, `future_initiative`)
- `designation_pillar_id` (FK → pillars, nullable)
- `designation_initiative_id` (FK → future_initiatives, nullable)
- `payment_method` (enum: `cbe_transfer`, `card`, `paypal`)
- `status` (enum: `pending_reconciliation`, `pledged`, `completed`, `failed`, `refunded`)
- `reference_code` (unique — shown to CBE-transfer donors to include on their transfer)
- `provider_transaction_id` (nullable — for card/PayPal, from the payment provider)
- `receipt_sent_at` (nullable timestamp)
- `donor_message` (text, nullable)

**`recurring_pledges`**
Tracks the "recurring" commitment for local bank-transfer donors, since true auto-debit isn't available on CBE transfers (see companion scope doc §4.1).

- `donor_id` (FK)
- `amount`, `designation_type`, `designation_pillar_id`, `designation_initiative_id` (same shape as `donations`)
- `status` (enum: `active`, `paused`, `cancelled`)
- `next_reminder_date`
- `reminder_channel` (enum: `email`, `sms`, `telegram`)

**`donation_reconciliation_log`**
Audit trail of the manual bank-matching step.

- `donation_id` (FK)
- `matched_by` (FK → users)
- `matched_at`
- `bank_reference_note` (text)

### 3.6 Volunteers

**`volunteer_applications`**
Note: could be modeled as a `form_submission` against the `volunteer-application` form definition, but is broken out as its own table because its workflow (safeguarding, credential checks) is materially different from beneficiary applications and deserves first-class fields rather than everything jammed into a JSON blob.

- `full_name`, `email`, `phone`, `region`
- `areas_of_interest` (JSON — array of pillar_ids or free-text tags)
- `skills` (JSON — array of tags)
- `availability` (text)
- `professional_credentials` (text, nullable — for medical/mental health volunteers)
- `status_id` (FK → status_options)
- `references_checked` (boolean)
- `credentials_verified` (boolean, nullable — only relevant for professional roles)
- `safeguarding_checklist_complete` (boolean, default false)
- `assigned_reviewer_id` (FK → users)

**`volunteer_safeguarding_checklist_items`**
Config-driven checklist so the required steps can change from the dashboard.

- `label`, `label_am`
- `sort_order`
- `is_active`

**`volunteer_safeguarding_checks`**

- `volunteer_application_id` (FK)
- `checklist_item_id` (FK)
- `completed_by` (FK → users)
- `completed_at`

**`volunteer_placements`**

- `volunteer_application_id` (FK)
- `pillar_id` (FK, nullable)
- `role_description` (text)
- `started_at`, `ended_at` (nullable)

**Hard rule, not just a UI nicety:** an application cannot transition to an "Approved" status (see §3.9) while `safeguarding_checklist_complete` is false. Enforce this in the server-side status-transition function, not only in the UI, since this is a safeguarding control and must not be bypassable by a direct API call.

### 3.7 Contact & Newsletter

**`contact_submissions`** — could also ride on `form_submissions` against a `contact-form` definition; either is acceptable, but be consistent — don't build a second bespoke contact table if the dynamic form system already covers it.

**`newsletter_subscribers`**

- `email`
- `subscribed_at`
- `is_active`
- `source` (enum: `homepage`, `donation_flow`, `manual`)

### 3.8 Files & Media

**`files`**

- `original_filename`
- `storage_path`
- `mime_type`
- `size_bytes`
- `is_public` (boolean — public media vs. private case documents; enforce at the storage/serving layer, not just this flag)
- `uploaded_by` (FK → users, nullable — public form uploads won't have one)

### 3.9 Status Options (config-driven workflow states)

**`status_options`**
Rather than hardcoding the case and volunteer workflow states as a database enum only, model them as data so the _labels, colors, and order_ are dashboard-editable, while the underlying _stage_ (which controls logic like the safeguarding gate above) stays a fixed, code-level category.

- `context` (enum: `application`, `volunteer` — which workflow this status belongs to)
- `stage` (enum, fixed in code: for applications — `submitted`, `under_review`, `verified`, `approved`, `declined`, `active`, `closed`; for volunteers — `submitted`, `under_review`, `references_checked`, `credentials_verified`, `approved`, `declined`)
- `label`, `label_am` (editable)
- `color` (editable, for dashboard badges)
- `sort_order`

Agent instruction: application/volunteer records store `status_id` (FK), never a raw string, so relabeling a status from the dashboard doesn't require touching data. Logic that gates transitions (like the safeguarding rule) keys off `stage`, never off `label`, so relabeling never breaks a workflow rule.

### 3.10 Users, Roles & Permissions

Use the existing domain-agnostic user management and role/permission system rather than building new auth. Map roles as follows:

| Role                    | Access                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `super_admin`           | Full access, including `site_settings`, `form_definitions`, `pillars`, user management                                  |
| `program_staff`         | `form_submissions`, `beneficiaries`, `disbursements` scoped to their assigned `pillar_id`(s) only                       |
| `finance`               | `donations`, `recurring_pledges`, `donation_reconciliation_log`, `disbursements` (amount/date only, not case narrative) |
| `volunteer_coordinator` | `volunteer_applications`, `volunteer_placements`, `volunteer_safeguarding_checks`                                       |

**`user_pillar_assignments`** (if not already covered by the existing permission system's scoping mechanism)

- `user_id`, `pillar_id`

**Hard rule:** `program_staff` scoped to Mental Wellness must not see Medical Hardship case notes or documents, and vice versa, unless explicitly granted both. This is a stated privacy requirement, not a preference — implement it as a query-level scope, not a UI-level hide.

### 3.11 Audit Log

**`audit_log`**

- `user_id` (FK, nullable — null for anonymous public actions)
- `action` (string, e.g. `viewed_case`, `updated_status`, `exported_data`, `edited_content_block`)
- `entity_type`, `entity_id`
- `metadata` (JSON)
- `created_at`

Every read and write to `form_submissions`, `beneficiaries`, `volunteer_applications` (and their related notes/documents) must write an `audit_log` row. This is non-negotiable given the sensitivity of medical and mental-health-adjacent data.

---

## 4. Impact Metrics — Computed, Not Entered

The dashboard must **not** have a manual "type in this quarter's numbers" screen as the primary source. Compute from source data:

- Families supported = distinct `beneficiaries` with ≥1 `form_submissions.status` at `active` or `closed` stage.
- Students sponsored = count of Youth & Education submissions at `active`/`closed` (sponsorship module proper arrives in v2).
- Elders cared for = same pattern for the Elder Care pillar.
- Funds raised = `sum(donations.amount) where status = 'completed'`.

Cache these on a schedule (e.g. hourly) into a small `impact_metrics_cache` table for homepage performance, but always allow a `site_settings` override (`impact.override_*`, per §3.1) for the rare case staff need to publish a manually-verified number instead of the live count.

---

## 5. Dashboard Modules (Admin UI)

Map directly to the tables above. Each should be a generic CRUD-generator screen unless flagged **[custom]**.

1. **Content & Pages** — edit `pages`, `content_blocks`, `navigation_items`, `translations`. **[custom: block editor]** — a drag-orderable block list per page is worth a purpose-built screen; everything else here is generic CRUD.
2. **Site Settings** — one auto-rendered form per `group` in `site_settings`. Fully generic.
3. **Pillars & Programs** — CRUD on `pillars`, `future_initiatives`. Generic.
4. **Form Builder** — CRUD on `form_definitions` and `form_fields`. **[custom]** — needs a field-list builder UI with drag-reorder and a live preview pane; this is the highest-value custom screen in the whole system, since it's what lets staff add or change a question on the Medical Hardship form without a developer.
5. **Applications / Case Management** — list + detail view of `form_submissions`, grouped by pillar. **[custom: workflow board]** — a kanban-style view by `status_options.stage` is worth building; detail view (notes, documents, disbursements) can otherwise use generic components.
6. **Beneficiaries & Households** — generic CRUD, with a submissions/disbursements history panel on the detail view.
7. **Donations & Reconciliation** — **[custom]** — the pending-CBE-pledge matching queue is a genuinely bespoke workflow (list of unmatched bank references against pending donations), not a fit for generic CRUD. Donor list and donation ledger elsewhere can be generic dynamic tables with the existing filter/chart components.
8. **Volunteers** — list + detail with safeguarding checklist and credential fields. **[custom: safeguarding gate]** — the approve action must be disabled server- and client-side until the checklist is complete.
9. **Impact Dashboard** — read-only, built on the existing dashboard/chart components against `impact_metrics_cache` and live donation/application queries.
10. **Users & Permissions** — from the existing role/permission system, extended with `user_pillar_assignments`.
11. **Audit Log Viewer** — generic filterable table over `audit_log`, read-only, restricted to `super_admin`.

---

## 6. Public Site — Rendering Rules

- Every public page renders `content_blocks` for its `page_id` in `sort_order`, via a generic block-type renderer (`rich_text` → prose component, `image` → image component, `stat_counter` → reads from `impact_metrics_cache` or `site_settings` override, etc.). No page template should contain hardcoded prose.
- Navigation renders from `navigation_items`.
- Every application form, the volunteer form, and the contact form render from `form_definitions` + `form_fields` via the generic form renderer — no per-pillar Svelte form component.
- Language toggle reads `translations` and the `_am` columns on content tables; default to `en` with a persisted user preference (cookie or account setting).

---

## 7. What Is Deliberately NOT Dashboard-Editable

To be explicit, since §0 sets a strong default the other direction — these remain developer/code-level by design:

- Payment provider API keys and secrets (environment variables, never in the database).
- The `stage` field on `status_options` (labels are editable; the underlying workflow stages and their gating logic are not, since safeguarding and financial-integrity rules depend on them).
- Role definitions and their base permission sets (who _can_ be a `program_staff` is dashboard-editable via user management; what a `program_staff` role _can do_ is not, since that's an access-control decision, not a content decision).
- Database schema itself, obviously — this document defines it; changes go through migrations, not the dashboard.

---

## 8. Build Order for the Agent

1. Auth, roles, and `users` / `user_pillar_assignments`, using the existing permission system.
2. `site_settings`, `pages`, `content_blocks`, `navigation_items`, `translations` — get the public site content-driven first, since everything else depends on this pattern being proven.
3. `pillars`, `future_initiatives` — seed with the four pillars and three future initiatives from the companion scope document.
4. `form_definitions`, `form_fields`, `form_submissions` + generic form renderer and generic Zod schema generator. Seed the four application forms, volunteer form, and contact form.
5. `status_options`, wired to `form_submissions.status_id` and `volunteer_applications.status_id`, with stage-gating logic (especially the safeguarding gate).
6. `beneficiaries`, `households`, `disbursements`, case management dashboard.
7. `donors`, `donations`, `recurring_pledges`, `donation_reconciliation_log` — public donation flow first, reconciliation dashboard second.
8. `volunteer_applications`, `volunteer_safeguarding_checklist_items`, `volunteer_safeguarding_checks`, `volunteer_placements`.
9. `files`, wired into document upload on applications and image upload on content blocks.
10. `audit_log`, retrofitted onto every sensitive read/write from step 6 onward — do not leave this until the end, since it's easy to miss a code path once features exist.
11. `impact_metrics_cache` and the public impact dashboard.
12. Newsletter and Telegram notification hooks (flagged as recommended, not mandatory, in the companion scope document).

---

## 9. Companion Document

`SAF-Website-v1-Scope-and-Features.md` — the client-facing scope document. Use it for all copy, tone, page content, and the list of what's explicitly out of scope for v1. This technical spec should not contradict it; if a conflict is found, flag it rather than silently resolving it either way.
