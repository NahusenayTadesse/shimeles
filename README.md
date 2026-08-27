# Shimeles Abera Foundation

A nonprofit operations system for the Shimeles Abera Foundation, Addis Ababa. The
public website is one _view_ of the data; the dashboard is where the data lives.

Built against `SAF-AI-Agent-Technical-Spec.md`, which is the source of truth for
structure. Section references throughout the code (`§3.6`, `§0`) point back at it.

---

## The governing rule

> Nothing a non-technical Foundation staff member might reasonably want to change
> is hardcoded.

Concretely, none of the following is a string literal anywhere in `src`:

| Thing                                           | Where it actually lives                                  |
| ----------------------------------------------- | -------------------------------------------------------- |
| Pillar names, descriptions, icons, colours      | `pillars`                                                |
| Page body copy                                  | `content_blocks`, rendered by one generic block renderer |
| Every form's questions and validation           | `form_definitions` + `form_fields`                       |
| Navigation, footer links                        | `navigation_items`                                       |
| Phone numbers, socials, bank details, hero copy | `site_settings`                                          |
| Workflow status labels, colours, order          | `status_options`                                         |
| Safeguarding checklist                          | `volunteer_safeguarding_checklist_items`                 |
| Regions                                         | `regions`                                                |
| External giving platforms (PayPal, Zeffy)       | `donation_campaigns`                                     |
| UI strings                                      | `translations`                                           |
| Help-panel questions and answers                | `help_topics`                                            |

The test applied to every decision: _if the Foundation's program manager wants to
change this next year with no developer involved, can they?_

Four things are deliberately **not** dashboard-editable, per §7 of the spec:
payment provider secrets (environment variables), the `stage` field on a status
(workflow gating depends on it), role permission sets (an access-control
decision, not a content one), and the schema itself.

---

## Running it

```bash
bun install
cp .env.example .env          # then set BETTER_AUTH_SECRET
bun run db:migrate            # creates local.db
bun run db:seed               # config, pillars, forms, pages, payment details
bun run dev
```

Then open `/setup` and create the first administrator. That route closes itself
permanently once one account exists — and the seed deliberately does not create
a staff account, because a committed password hash is a committed vulnerability.

| Command               | What it does                                                             |
| --------------------- | ------------------------------------------------------------------------ |
| `bun run dev`         | Development server                                                       |
| `bun run build`       | Production build (adapter-node)                                          |
| `bun run check`       | `svelte-check` over the whole project                                    |
| `bun run db:generate` | Generate a migration from the schema                                     |
| `bun run db:migrate`  | Apply migrations                                                         |
| `bun run db:seed`     | Seed/refresh configuration data — idempotent, never clobbers edited copy |
| `bun run db:studio`   | Drizzle Studio                                                           |

The seed runs under `tsx` rather than Bun: `better-sqlite3`'s native addon
crashes Bun's NAPI layer.

---

## Stack

Svelte 5 + SvelteKit · Tailwind v4 · shadcn-svelte · Superforms + Zod 4 ·
Drizzle ORM · **SQLite** (better-sqlite3) · Better Auth · adapter-node.

The spec names MySQL; this project uses SQLite, which is the one deliberate
divergence. Everything downstream is adapted for it — see _Money_ and _SQLite
tuning_ below.

The reusable toolkit — form components, dynamic tables, the CRUD generator, the
file management system with caching, browser-side image compression — is carried
over from the Gifa Lounge and church codebases, adapted from MySQL to SQLite and
extended with the permission and audit layers this system needs.

---

## Architecture

### The dynamic form engine

There are no hand-written application forms in this repo. A `form_definitions`
row plus its `form_fields` becomes, at request time:

- a **Zod schema** (`$lib/server/forms.ts` → `buildSchema`), and
- a **`RenderForm`** drawn by one component (`$lib/forms/DynamicForm.svelte`).

Add a question in `/dashboard/forms/[id]` and it appears on the live public form
on the next request, validated and stored, with no deploy. The builder's preview
pane renders the same component the public route does, so it cannot disagree
with reality.

**The low-barrier guarantee.** A form flagged `is_low_barrier` — Mental Wellness
— has contact fields and uploads forced optional by the schema generator, no
matter what anyone later ticks in the builder. The promise the form makes to the
person filling it in cannot be broken by a well-meaning edit.

### Two hard rules, enforced server-side

Both are in the spec as requirements rather than preferences, and both are
implemented where a direct POST cannot get around them.

**Pillar scope (§3.10).** Program staff scoped to Mental Wellness must not see
Medical Hardship case notes or documents. `pillarScope()` folds a `WHERE` clause
into every case query; `assertPillarAccess()` guards every detail route and
every mutating action; and `/files/[name]` re-checks it before streaming a
private document. It is a query-level scope, not a UI-level hide.

**The safeguarding gate (§3.6).** A volunteer cannot reach an `approved` stage
while their safeguarding checklist is incomplete. `setVolunteerStatus()` refuses
the transition — the disabled button is a courtesy, the server call is the
control. Verified:

```
POST /dashboard/volunteers/1?/setStatus  statusId=<approved>
→ 422 "This volunteer cannot be approved until every safeguarding check is complete."
```

The flag is _derived_ from the checklist, never set by hand, so adding a check
re-opens the gate on volunteers approved against the shorter list. That is
deliberate: a safeguarding requirement that only applies to future volunteers is
not a requirement.

### Audit (§3.11)

Every read _and_ write touching `form_submissions`, `beneficiaries`,
`volunteer_applications`, their notes and their documents writes an `audit_log`
row — including denied attempts and private-document downloads. `$lib/server/audit.ts`
is the only writer, and it never throws: a locked log table must not stop a
caseworker opening a file.

### Impact metrics (§4)

Computed, never entered. Derived hourly from case and donation records into
`impact_metrics_cache`; the precedence on read is **override → cache → live**.
A `site_settings` override is available for a manually-verified figure, and the
impact screen says plainly when one is in effect.

`funds_raised` sums only `completed` donations — a pledge in the reconciliation
queue is a promise, not money, so the public counter cannot show funds that have
not landed.

### Donations, and why "monthly" is a pledge

Bank transfers in Ethiopia cannot be auto-debited. A monthly donor here is
somebody who gets a reminder and makes a transfer, so choosing "monthly" creates
a `recurring_pledges` row, and each fulfilled month becomes its own `donations`
row when finance matches it against a statement line in the reconciliation
queue. Reconciliation is the only path to `completed`, and it writes the donor's
lifetime total and a `donation_reconciliation_log` entry in one transaction.

### External giving platforms

`donation_campaigns` holds the outside payment platforms offered on the Donate
page — PayPal, Zeffy, whatever comes next.

**The PayPal form is generated, not pasted.** PayPal hands you a snippet of HTML
and a link; the only thing specific to this Foundation is one identifier. Staff
paste the _link_, `paypalTarget()` in `$lib/donations.ts` lifts the
`campaign_id` (or `hosted_button_id`) out of it, and the form around that hidden
input is ours — our button, our type, our theme, rather than a fixed-width GIF.
Changing campaign is one URL edit; nothing else moves.

Two things are checked at save time rather than discovered by a donor: the URL
must be `http(s)` (a `javascript:` URL in a staff-editable link is stored XSS),
and a link flagged as PayPal must contain a parseable identifier.

**These gifts are not recorded in this system.** The platform collects the money
and sends its own receipt, so they never create a `donations` row, never reach
the reconciliation queue, and are not counted in the public "funds raised"
figure. Finance reconciles them from the platforms' own reports. The dashboard
screen says exactly this, because a staff member who assumed otherwise would
under-report the Foundation's income.

### Money

Every amount is an **integer in the currency's minor unit** — santim for ETB,
cents for USD. SQLite has no `DECIMAL`; a `decimal(12,2)` column silently
becomes a float, and floats lose cents. Convert only at the edges, through
`$lib/money.ts`.

### Language

**v1 is English-only, with one exception, and the page itself does not switch.**
There is no language toggle in the chrome, no `?lang=` parameter, no locale
cookie, and `<html lang="en">` is fixed.

The exception is the **help panel** (`$lib/components/help-panel.svelte`, shown
on `/donate`). Its questions are `help_topics` rows carrying both languages, and
a visitor switches between them inside the panel. It is deliberately the
smallest possible foothold: donors were arriving at the transfer step confused,
and confusion is the one place a second language pays for itself before a full
translation pass exists. Nothing outside the panel changes language with it, and
a topic with no Amharic falls back to English rather than to a blank — the
switch is offered only once some topic has been translated.

What is kept, deliberately:

- The `translations` table and the cached `t(key)` helper. Editing a button
  label is still a dashboard edit rather than a deploy — that was never really
  about translation.
- Every `*_am` column in the schema, plus `preferred_language` on users, donors
  and beneficiaries, and `language` on submissions. Outside `help_topics` and
  the three `help.*` strings the panel reads through `stringPairs`, they are
  nullable, unwritten and unread. §1 of the spec requires somewhere to put
  Amharic, and keeping the columns makes restoring it a rendering change rather
  than a migration.

What was removed: the toggle component, the language plumbing through
`hooks.server.ts` and every `load`, the Amharic inputs on the dashboard forms,
and the seeded Amharic strings. The seeded values went with the rest — they were
unreviewed placeholder text, and v2 should start from a real translation pass
rather than inherit them.

To restore: read the `*_am` columns in `$lib/server/content.ts`,
`$lib/server/forms.ts` and `$lib/server/settings.ts`, put `lang` back on
`locals`, and re-add the toggle.

---

## SQLite tuning

Set on connect in `src/lib/server/db/index.ts`:

| Pragma                                            | Why                                                                                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `journal_mode = WAL`                              | The load-bearing one. Under the default rollback journal a single writer blocks every reader; under WAL, readers never block and are never blocked. |
| `synchronous = NORMAL`                            | The correct companion to WAL — fsync at checkpoints rather than every commit.                                                                       |
| `busy_timeout = 5000`                             | A contended write waits and retries instead of throwing `SQLITE_BUSY`.                                                                              |
| `cache_size = -64000`                             | Negative means KiB, so this is a 64 MB page cache.                                                                                                  |
| `mmap_size = 256MB`, `temp_store = MEMORY`        | Fewer syscalls on read; sorts stay in memory.                                                                                                       |
| `foreign_keys = ON`                               | Off by default, per connection. Every FK in the schema is inert without it.                                                                         |
| `wal_autocheckpoint`, `auto_vacuum = INCREMENTAL` | Keep the WAL and the soft-delete tombstones from growing unbounded.                                                                                 |
| `optimize` hourly                                 | Refreshes planner statistics, so a query planned at 10 rows is not still planned that way at 100,000.                                               |

Indexes are declared rather than left to chance — the case list filters by
pillar, status and region on every load.

Measured on the production build, 240 concurrent requests with reads and writes
interleaved:

```
reads (idle)            200 requests, 2.5ms each   200 OK
reads (during writes)   200 requests, 2.3ms each   200 OK
writes                   40 requests, 14.4ms each  200 OK
```

Read latency is unchanged by concurrent writes, and no request hit `SQLITE_BUSY`.

**Operationally:** back up `local.db` _and_ its `-wal` and `-shm` files together,
or run `wal_checkpoint(TRUNCATE)` first. A `.db` copied on its own is missing
whatever is still in the WAL. `FILES_DIR` needs backing up alongside it.

---

## Dashboard modules

Generic CRUD-generator screens unless marked otherwise.

| Module                                                                                                                                                                                       | Notes                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Applications                                                                                                                                                                                 | **custom** — kanban board grouped by workflow stage, plus a case detail with notes, documents and disbursements |
| Volunteers                                                                                                                                                                                   | **custom** — safeguarding checklist and the approval gate                                                       |
| Donations                                                                                                                                                                                    | **custom** — the bank-matching reconciliation queue                                                             |
| Form builder                                                                                                                                                                                 | **custom** — question list with reorder and a live preview                                                      |
| Pages & content                                                                                                                                                                              | **custom** — block editor with reorder                                                                          |
| Site settings                                                                                                                                                                                | Auto-generated, one form per group, entirely from the rows                                                      |
| Impact                                                                                                                                                                                       | Read-only, computed                                                                                             |
| Audit log                                                                                                                                                                                    | Read-only, `super_admin` only, not exportable or deletable                                                      |
| Users                                                                                                                                                                                        | Roles and pillar assignment                                                                                     |
| Roles                                                                                                                                                                                        | Read-only by design — §7                                                                                        |
| Donation links                                                                                                                                                                               | Generic — external platforms, with the parsed PayPal id shown per row                                           |
| Pillars, initiatives, navigation, translations, statuses, regions, safeguarding checklist, payment methods and accounts, beneficiaries, households, donors, pledges, disbursements, messages | Generic                                                                                                         |

---

## Known gaps

- **`SAF-Website-v1-Scope-and-Features.md` is not in this repo.** The spec names
  it as the source of truth for copy and tone. The seeded prose is written from
  §1 of the technical spec and is explicitly placeholder — replace it through the
  dashboard, which is the point of the content model.
- **Amharic is deferred to a later version** at the client's request, apart
  from the donate page's help panel. See _Language_ above for what that reads
  and what is still English. The seeded Amharic in `help_topics` is a first
  draft and wants a native speaker's eye before anyone calls it finished.
- **Sponsorship** is v2 per the spec. The schema does not conflict with it:
  `beneficiaries`, `households` and designated giving are all in place.
- **Telegram notifications** are flagged as recommended rather than mandatory in
  the companion doc. `$lib/server/notify.ts` is where they would go; the
  `reminder_channel` enum already carries `telegram`.
- **Card and PayPal** are modelled (`payment_methods.kind`, `donations.provider_transaction_id`)
  but no provider is integrated — no keys, no webhook. Bank transfer and mobile
  money are the live paths.

# shimeles
