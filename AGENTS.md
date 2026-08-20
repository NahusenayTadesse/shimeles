# Working on this codebase

Shimeles Abera Foundation — a nonprofit operations system. Read `README.md` for
the architecture and `SAF-AI-Agent-Technical-Spec.md` for the requirements the
code is written against. Section markers in comments (`§3.6`, `§0`) point at
that spec.

## Project configuration

- **Language**: TypeScript
- **Package manager**: bun — _except_ `db:seed`, which runs under `tsx`
- **Database**: SQLite via better-sqlite3 + Drizzle
- **Add-ons**: prettier, eslint, tailwindcss v4, sveltekit-adapter-node,
  drizzle, better-auth, shadcn-svelte, superforms + zod 4, mdsvex

## Before you change anything

**The governing rule (§0):** nothing a non-technical staff member might want to
change is hardcoded. Before adding a string literal to a `.svelte` file, check
whether it belongs in `site_settings`, `translations`, `content_blocks`,
`pillars`, `status_options` or `form_fields` instead. Before hand-writing a
form, use the dynamic form engine. Before hand-writing an admin screen, use
`contentCrud` in `$lib/server/crud.ts`.

**Two rules are load-bearing and must stay server-side:**

1. `pillarScope()` / `assertPillarAccess()` — a caseworker scoped to one pillar
   must not reach another pillar's case notes or documents, including by direct
   POST or by URL. Fold the scope into the query; never hide it in the UI.
2. `setVolunteerStatus()` — a volunteer cannot reach an `approved` stage while
   safeguarding is incomplete. The check lives in the transition function that
   every path goes through, precisely so a direct POST cannot skip it.

**`/volunteer` is deliberately not a `form_definitions` row.** Volunteering is
a core workflow with a safeguarding gate on the end, so the questions the gate
depends on are code, not form-builder rows — a coordinator deleting the
references section would be disabling a control, not editing copy. What stays
editable is the _vocabulary_: `volunteer_skills`, `volunteer_skill_categories`,
`volunteer_time_slots` and `volunteer_professions`, all managed from
Configuration → Volunteer setup. Adding a skill is a row, never a deploy.

**Three columns on `volunteer_applications` are derived and have exactly one
writer each.** Set them anywhere else and the next recompute silently reverts
you — while the approval gate reads them:

| Column                                                                | Written only by           | Source of truth                      |
| --------------------------------------------------------------------- | ------------------------- | ------------------------------------ |
| `credentials_verified`, `is_professional`, `professional_credentials` | `recomputeCredentials()`  | `volunteer_credentials` rows         |
| `references_checked`                                                  | `recomputeReferences()`   | `volunteer_references` rows          |
| `safeguarding_checklist_complete`                                     | `recomputeSafeguarding()` | `volunteer_safeguarding_checks` rows |

The manual flags in the sidebar of a volunteer's file exist only for
applications taken through the old dynamic form, which have no rows to derive
from; the action refuses to set them once rows exist.

**`/contact` is a real route too, and messages are no longer
`form_submissions`.** §3.7 allows either; the deciding factor was that an
enquiry gets _routed_ and _answered_, and neither has anywhere to live on a
submission row (a case's history is internal notes; a message's is a thread of
replies that mostly were sent). Messages are `contact_messages`, the thread is
`contact_message_replies`, and the topics in `contact_subjects` carry their own
routing — notify list, default assignee, response target — so "press enquiries
now go to the comms lead" is an edit on Configuration → Contact setup.

Migration `0012` **copied** the old contact submissions into `contact_messages`
rather than moving them; the `form_submissions` rows are still there untouched.
Nothing reads them any more, and the dashboard's "new applications" badge now
excludes pillar-less rows so a message is not counted in two badges.

**`contact_message_replies.is_internal` is load-bearing.** An internal note and
a sent reply are the same shape, and the only difference is whether the person
who wrote in can see it. It is set explicitly from two separate submit buttons
and never inferred. `first_responded_at` is stamped by the first non-internal
reply and never moved afterwards.

**`/apply` is a real route, but an application is still a `form_submissions`
row.** Unlike volunteers and contact, the case table was _not_ replaced —
pillar scope, case notes, documents, disbursements and the audited reads all
hang off it, and a fourth parallel case table would fracture every one of them.
What `/apply` adds is the structure around it:

- `application_subjects` — 1:1 with the submission. **Who is being helped**,
  which is frequently not who filled the form in.
- `application_needs` — what they asked for, from the `assistance_needs`
  catalogue. Each need can name the pillar it routes to, which is how an
  application gets filed without the applicant knowing the Foundation's
  structure.
- `languages` — what the applicant's own words are written in. Not a UI
  language; v1 is still English-only.

**Accepting an application must key on the subject, not the applicant.**
`acceptApplication()` in `$lib/server/apply.ts` reads `application_subjects`;
the older `linkBeneficiary()` in `$lib/server/submissions.ts` reads
`submitted_by_*` and is correct only when someone applied for themselves. The
case screen picks between them on whether a subject row exists. Get this wrong
and a daughter applying for her mother creates a beneficiary record in the
daughter's name, and every disbursement afterwards is recorded against the
wrong person.

**`z.coerce.number()` turns `null` and `''` into `0`.** In a `z.union([...])`
the first branch to succeed wins, so a number listed before the empty cases
swallows them: a cost nobody knows becomes 0 birr, and a time slot with no
fixed day becomes Sunday. Use `optionalNumberField()` from
`$lib/forms/fields.ts` (re-exported by `$lib/server/crud.ts`) rather than
hand-rolling the union. `optionalIdField` is safe only because `.positive()`
rejects the 0.

**Every read and write** touching `form_submissions`, `beneficiaries`,
`volunteer_applications` and their notes and documents writes an `audit_log`
row via `$lib/server/audit.ts`. Reads too, not just writes.

**v1 is English-only and not switchable.** Do not add a `lang` prop, a locale
cookie or a language toggle. The `*_am` columns exist and are deliberately
unread — leave them alone rather than deleting them; they are the v2 path.

## Gotchas that will cost you time

- **`bun run src/lib/server/db/seed.ts` crashes.** better-sqlite3's native addon
  hits a fatal NAPI error under Bun. The seed script runs under `tsx`, which is
  why `db:seed` is the one script that does not use bun.
- **Money is an integer in minor units.** Santim for ETB, cents for USD. SQLite
  has no `DECIMAL`. Convert only through `$lib/money.ts`.
- **`z.coerce.boolean()` is wrong for form fields.** An unticked checkbox and a
  `<select>` set to "No" both post the string `"false"`, and `Boolean("false")`
  is `true`. Use `flagField()` from `$lib/server/crud.ts`.
- **SQLite treats NULLs as distinct in a unique index.** A
  `unique(a, b, c)` where `b` and `c` are nullable does not constrain rows where
  they are null. See the note on `impact_metrics_cache`.
- **drizzle-kit cannot emit expression indexes.** `uniqueIndex().on(sql\`...\`)`generates a mangled`CREATE INDEX`. Use a plain column index and enforce the
  invariant in the write path.
- **Timestamps are epoch milliseconds** (`timestamp_ms`), so `strftime` needs
  `/ 1000` and the `'unixepoch'` modifier.
- **Deletes are soft.** `contentCrud` sets `deleted_at`; every list filters on
  it. Pass `hardDelete: true` only for pure join rows.

## Svelte MCP server

You have access to the Svelte MCP server with Svelte 5 and SvelteKit
documentation.

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a
structured list with titles, use_cases, and paths. When asked about Svelte or
SvelteKit topics, ALWAYS use this tool at the start of the chat.

### 2. get-documentation

Retrieves full documentation for specific sections. After `list-sections`,
analyse the returned `use_cases` and fetch ALL sections relevant to the task.

### 3. svelte-autofixer

Analyses Svelte code and returns issues and suggestions. Use it whenever writing
Svelte code, and keep calling it until it returns nothing.

### 4. playground-link

Generates a Svelte Playground link. Only after user confirmation, and never for
code written into files in this project.
