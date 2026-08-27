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

**Every public page's head comes from one component.** `<Seo>`
(`$lib/components/Seo.svelte`) renders the title, description, canonical,
Open Graph, Twitter card and JSON-LD from the settings and the page's own
fields; `$lib/seo.ts` holds the rules. Do not hand-write `<svelte:head>` meta
tags on a public route — that is how the site ended up with three spellings of
its own name, a homepage titled "Home", and `og:image` values that were
relative paths no social crawler can resolve. Two things it depends on:

- **`site.url` is the origin of every absolute URL it emits**, not the request's
  own origin. A page reached at `www.` and at the apex has to name one canonical
  URL or the two compete as duplicates.
- **`/files` is deliberately crawlable.** The share image in every `og:image`
  is served from there, and Facebook, X and Google all read robots.txt before
  fetching a preview. Private files are protected by the endpoint (a session,
  the pillar scope, an audit row) and by a per-file `X-Robots-Tag`, which is
  where that decision belongs — not in a path prefix in `hooks.server.ts`.

`static/og-default.png` is the fallback share card, generated by
`bun run og:image`. Regenerate it if the logo or the palette changes.

## Gotchas that will cost you time

- **`bun run src/lib/server/db/seed.ts` crashes.** better-sqlite3's native addon
  hits a fatal NAPI error under Bun. The seed script runs under `tsx`, which is
  why `db:seed` is the one script that does not use bun.
- **Money is an integer in minor units.** Santim for ETB, cents for USD. SQLite
  has no `DECIMAL`. Convert only through `$lib/money.ts`.
- **Never add two currencies together.** The Foundation banks birr locally and
  dollars from the diaspora, and the minor units are not even the same size, so
  `sum(amount)` over a mixed table is a quantity of nothing — it used to be
  published on the homepage with a birr sign in front of it. Every total is a
  `MoneyTotal[]`, one entry per currency: group by the currency column in SQL,
  or use `sumByCurrency` / `toMoneyTotals` from `$lib/money.ts`, and render with
  `$lib/dashboard/money-totals.svelte`. There is deliberately no conversion
  anywhere — the Foundation does not record exchange rates, and a helper that
  invented one would bury the assumption in a `<span>`.
- **An email's absolute URLs come from `site.url`, never the request origin.**
  Same rule as `$lib/seo.ts`, sharper reason: an email outlives its request and
  is opened next week on a phone. `event.url.origin` would permanently bake in
  whatever host served the form — `localhost:5173` for a pledge made in
  development, a preview deployment, `www.` when the apex is canonical. Half
  the mail here has no request behind it anyway (pledge reminders, the hourly
  jobs). `email-templates.ts` falls back to the production origin so an unset
  setting still renders a working logo.
- **The email shell lives in `email-templates.ts`, which is dependency-free.**
  No `$lib` alias, no `$env`, no database — that is what lets
  `scripts/send-test-emails.ts` import it under tsx and put _the real design_
  in an inbox. It once held a copy instead, and the copy drifted: it was still
  sending terracotta after the app had gone green. `email.ts` re-exports it, so
  callers only ever import `$lib/server/email`. Its colours come from
  `layout.css` — green (`--clay`) leads, gold (`--olive`) accents.
- **Email is one sender and many templates.** A template is a pure function
  returning `EmailTemplate` — `{ subject, heading, body, action? }`, _not_
  finished HTML — and knows nothing about SMTP; `sendEmail({ to, ...template })`
  knows nothing about wording and wraps the body in the branded shell at send
  time, because the shell needs the site origin and that is an awaited setting.
  Adding an email is a function in the Templates section and no change to the
  sender. Build the body with `paragraphs()` for anything a person typed (it
  escapes as it goes, and dropping prose into a bare `<p>` collapses every
  newline) and `panel()` for an inset note. `sendEmailToEach` sends staff notification lists as
  separate messages so a shared `to` header cannot disclose the list. A missing
  SMTP host or recipient returns `{ sent: false }` rather than throwing: a
  stored submission must not fail because the mail server is down.
- **Every dynamic form acknowledges its submitter, from one place.**
  `acknowledgeSubmission` is called in `handleFormSubmission`, so the four
  programme applications on `/programs/[slug]`, anything at `/forms/[slug]` and
  any `form_embed` block are covered — and a fifth programme added from the
  dashboard tomorrow is too, with no code change. The body is the form's own
  `success_message`, so the confirmation on screen and the one in the inbox are
  the same sentence. `/apply`, `/volunteer` and `/contact` have their own
  submit paths and their own wording, so they do **not** come through here;
  their `form_definitions` rows must keep `acknowledge_submitter` off or their
  applicants get two emails.
- **`acknowledge_submitter` is off for a low-barrier form, and that is
  safeguarding, not preference.** Mental Wellness is designed so that asking
  for help costs as little as possible; an unexpected email headed with the
  Foundation's name, arriving on a shared device or a family address, is a
  cost. Staff can still turn it on per form at Configuration → Forms.
- **Staff notifications resolve through `staffRecipients()`**: a per-form
  `notify_emails` list, then the `contact.email_primary` setting, then
  `MAIL_ADMIN`/`SMTP_USER`. The last step exists because the fallback used to
  be a placeholder on a domain the Foundation does not own — a fresh
  installation quietly mailed a stranger on every contact submission. Never
  give a notification its own fallback chain; the four had already drifted, and
  one of them fell through to sending nothing at all.
- **`magicLink({ disableSignUp: true })` is load-bearing, and it is not
  enough on its own.** Without the flag the endpoint creates an account for any
  address posted to it — a public signup route by another name, on a system
  holding case data, which is the exact hole `handleBlockPublicSignup` closes
  for email/password. But Better Auth enforces the flag at _verify_ time: the
  send endpoint looks nothing up and mails a branded sign-in link to whatever
  address it is given. `/magic-link`'s action therefore does its own account
  lookup and stays silent when there is none, the way `requestPasswordReset`
  does internally. Never call `auth.api.signInMagicLink` without that check.
- **Every account-recovery endpoint answers with one fixed sentence.**
  `/login`, `/forgot-password` and `/magic-link` are all reachable by anyone,
  and a reply that differed for a known address would turn them into
  account-enumeration oracles. The failure branch says exactly what the success
  branch says; the difference goes to the server log and to `audit_log`
  (`password_reset_requested`, `magic_link_requested`, with `matched: false` on
  the misses — a run of those is what probing looks like).
- **A reset link's origin is `ORIGIN`, not `site.url`.** The opposite of every
  other email, and deliberately: the token at the end of it is verified by the
  running server, so it has to be the origin actually serving the app. Set
  `ORIGIN` correctly in production or every reset and sign-in link 404s.
- **A case note and a reply are the same text; `is_internal` is the whole
  difference.** `form_submission_notes.is_internal` defaults to **true** —
  the opposite of `contact_message_replies.is_internal`, deliberately: a
  message is a conversation whose rows are mostly sent, a case file is a
  working record whose rows are mostly private, and a caseworker's assessment
  of a family must never reach that family because a default leaned the wrong
  way. Both are set from two separate submit buttons and never inferred from
  whether an address exists. Go through `addSubmissionNote` — it sends before
  stamping `sent_at`, so a bounced reply is recorded as unsent rather than
  leaving the case looking answered.
- **Which status changes email the applicant is a row, not an `if`.**
  `status_options.notify_applicant` turns it on and `public_description` is
  what the email says, both edited at Configuration → Statuses (§0). The send
  lives in `setSubmissionStatus` / `setVolunteerStatus` in
  `$lib/server/workflow.ts`, after the write and the audit row, and never
  throws — a transition that succeeded must not be reported as failed because
  SMTP is down. A status flagged to notify with no `public_description` sends
  nothing and warns: an email whose body is a status label teaches the reader
  to ignore the next one.
- **Three ways a status change reaches a person, and one rule about what it
  says.** The per-status flag above; the global `workflow.notify_on_status_change`
  switch (Settings → Workflow, or the checkbox on a case page, `settings.manage`
  only) which makes *every* change notify, applications and volunteers alike;
  and the "Notify applicant" button on a case, which goes through
  `notifyOfCurrentStatus` and asks permission of neither. What all three send is
  decided by `statusLetter` in `$lib/server/workflow.ts`: the status's
  `public_description` leads with the caseworker's note after it, or the note
  becomes the letter when the status has no wording of its own, or nothing is
  sent. It never invents a sentence — no button can put words in front of a
  family that nobody at the Foundation wrote. A manual send writes its own case
  note and a `notified` audit row, because "who told this family, and when" is
  not recoverable from the status history.
- **`npm run mail:test -- you@example.com` renders every template to a real
  inbox.** It sends real mail from the Foundation's real account, so it refuses
  to run without an explicit recipient. `MAIL_TEST_ORIGIN` overrides the origin
  its logo and links are built from.
- **`npm run db:demo-money` fills the ledger with mixed currencies.** Demo
  data, deliberately not part of `db:seed`, which creates no donations at all —
  a real installation must never grow a fictional ledger. Everything it writes
  is tagged (`DEMO-` references, `@demo.invalid` donors) and
  `npx tsx scripts/demo-money.ts --clean` removes exactly that and nothing else.
  Use it when working on a money screen: with one ETB donation in the database
  every per-currency total looks identical to the single-figure version it
  replaced.
- **`donors.lifetime_total` is one currency only** — the donor's largest, named
  by `lifetime_currency`. It is a sort key and a headline, not their giving
  history; the donors screen reads the full breakdown off `donations`.
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
