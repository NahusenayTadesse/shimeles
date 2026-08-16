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
