# Bug report

A read of the server layer (`src/lib/server/**`, `src/hooks.server.ts`), the
public form paths (`/apply`, `/volunteer`, `/contact`, `/donate`, `/forms/*`)
and the dashboard routes, against the invariants stated in `AGENTS.md` and
`README.md`.

`svelte-check` reports 0 errors, so nothing here is a type error — these are
behavioural bugs, most of them cases where the code does the opposite of what
its own comment says it does.

Ordered by severity. Each entry gives the symptom, the mechanism, and the fix.

**Status: all fixed.** Each entry carries a `Fixed` note saying what changed.
Verified by running the app against a throwaway copy of `local.db` and
exercising each fix over HTTP — the evidence is quoted under the entries.
`svelte-check` 0 errors (88 pre-existing warnings), eslint clean apart from two
pre-existing `{@html}` warnings in `about/+page.svelte`, `vite build` succeeds.

---

## 1. A suspended staff account keeps full access — `banned` is never enforced

**Severity: critical.** Security control that does nothing.

`src/routes/dashboard/users/+page.server.ts:199-218` writes `user.banned = true`
and the table renders a "Suspended" badge (`user-name-cell.svelte:8`). Nothing
reads that column on the authentication path:

- `requireUser()` (`src/lib/server/permissions.ts:392`) checks only
  `event.locals.user`.
- `loadAccess()` (`:282`) selects role, permissions and pillar assignments; it
  never selects `banned`, and `Access` has no field for it.
- `handleBetterAuth` (`src/hooks.server.ts:87`) trusts whatever
  `auth.api.getSession` returns.
- Better Auth's ban enforcement lives in its `admin` plugin, which is **not**
  enabled — `src/lib/server/auth.ts:13` loads only `sveltekitCookies`.

A suspended caseworker's existing session keeps working, and they can sign in
again afterwards. The only place `banned` is read at all is an assignee picker
(`src/routes/dashboard/in-kind/[id]/+page.server.ts:196`).

**Fixed.**

- `Access` gains `isBanned`, resolved in `loadAccess` from `banned` _and_
  `banExpires` (an expiry in the past is a suspension that has run its course).
- `requireUser` refuses a suspended account. It signs the session out and
  redirects to `/login?suspended=1` rather than throwing a bare 403 — the only
  sign-out control in the app is an action on `/dashboard`, itself behind this
  guard, so a 403 would have been a dead end with no way out.
- `can()` returns false for a suspended account, so no nav item is drawn that
  the guard would then refuse.
- `/files/[name]` reads `loadAccess` directly rather than going through
  `requireUser`, so the check is repeated there — otherwise a suspended
  caseworker would have kept downloading case documents.
- `setBanned` now deletes the account's `session` rows, so the suspension does
  not wait for the user's next request, and clears `banExpires` alongside the
  flag.
- `/login` renders the reason when it is redirected to with `?suspended=1`.

---

## 2. `z.coerce.boolean()` on hidden inputs inverts every "No"

**Severity: critical.** This is the exact trap `AGENTS.md` documents under
"Gotchas", and it is live in five places. `Boolean("false") === true`, verified
against this repo's zod build:

```
z.coerce.boolean().parse('false')                      // => true
z.coerce.boolean().refine(v => v === true).safeParse('false')  // => success
```

It only bites where the browser posts the _string_ `"false"`, i.e. a hidden
input mirroring a boolean or a `<select>` whose "No" option has `value="false"`.
The three public forms that use `dataType: 'json'` (`/apply`, `/volunteer`,
`InKindForm`) post real booleans and are unaffected in practice, but they carry
the same schemas and will break the moment a hidden input is added.

### 2a. `/donate` — three fields, including newsletter consent

`src/routes/donate/schema.ts:38,42,51` uses `z.coerce.boolean()`, and
`src/routes/donate/+page.svelte:402,424,429` posts them through
`<input type="hidden" value={$form.isAnonymous}>` etc. Result:

- `joinNewsletter` is **always** true, so `+page.server.ts:317`
  (`if (data.joinNewsletter && email)`) subscribes every donor who supplies an
  email address, whether or not they ticked the box. That is a consent failure,
  not a display bug.
- `isAnonymous` is always true — every gift is recorded as anonymous, so no
  donor can ever be publicly thanked.
- `isDiaspora` is always true.

### 2b. `/contact` — newsletter consent again

`src/routes/contact/schema.ts:57`, posted by
`src/routes/contact/+page.svelte:303` as `value={String($form.joinNewsletter)}`.
`src/lib/server/contact.ts:201` then subscribes every sender who gave an email,
directly contradicting the comment above it ("A sender who did not tick the box
has not joined anything by writing to us").

### 2c. The dynamic form engine — every checkbox, including consent boxes

`src/lib/server/forms.ts:226-230`:

```ts
return required
	? z.coerce.boolean().refine((value) => value === true, `${field.label} is required`)
	: z.coerce.boolean().default(false);
```

`DynamicForm.svelte` is deliberately on the default multipart `dataType`
(`:36`), and `InputComp.svelte:70-75` renders `checkboxSingle` as a `<Checkbox>`
plus `<input type="hidden" bind:value={$form[name]}>`. So a box the user ticks
and then unticks posts `"false"` and is stored as `true`, and a **required
consent checkbox is satisfied by a direct POST of `consent=false`** — the
`.refine` passes because coercion has already turned the string into `true`.

### 2d. Dashboard: "Visible on the site" and "Required?" cannot be set to No

`src/routes/dashboard/pages/[id]/+page.server.ts:68` (`isPublished`) and
`src/routes/dashboard/forms/[id]/+page.server.ts:87` (`isRequired`) are fed by
`<SelectComp>` whose options are literally `{ value: 'false', name: 'No' }`
(`src/lib/dashboard/options.ts:11-14`, `forms/[id]/+page.svelte:57-60`).
Choosing "No" saves `true`. A staff member cannot hide a content block, and
cannot make a form field optional again.

### 2e. Latent, currently masked by `dataType: 'json'`

`src/routes/apply/schema.ts:106` (`safeToContact`) and `:122`
(`consentToVerify`); `src/routes/volunteer/schema.ts:127` (`isProfessional`),
`:137` (`hasPriorConviction`); `src/lib/inKind.ts:257,259,274,295,296,306,
311,312,314,318`. `safeToContact` and `hasPriorConviction` are the ones to care
about — both are safety-relevant and both would silently invert.

**Fixed.** `flagField` moved from `$lib/server/crud.ts` to
`$lib/forms/fields.ts` (re-exported from `crud.ts`, so the dashboard schemas
keep their single import) — the public schemas need it and cannot import
anything under `$lib/server`. A new `optionalFlagField()` sits beside it for the
tri-state case. Every `z.coerce.boolean()` in the repo is gone; the remaining
`z.coerce` calls are all numbers.

Consent gates compose as `flagField(false).refine((v) => v === true, …)`, which
is the ordering that matters: the string is resolved to a real boolean _before_
the refine sees it, so a POST of `consent=false` now fails.

The sweep also caught eight multi-line consent refines a single-line grep had
missed — `consentToStore`, `declareAccurate`, `acknowledgeNoGuarantee` on
`/apply`; `consentBackgroundCheck`, `agreeCodeOfConduct`, `declareAccurate`,
`acknowledgeNoGuarantee` on `/volunteer`; `consentToContact` on the in-kind
form. All were defeatable by posting the string `"false"`.

`hasPriorConviction` became `optionalFlagField()` rather than `flagField(false)`
— "not answered" and "they said no" are different facts on a safeguarding
question. This also fixed a second-order bug: the cross-field refine at
`volunteer/schema.ts:194` requires `priorConvictionDetail` whenever
`hasPriorConviction` is true, so under coercion every volunteer who ticked
**No** was being asked to describe a conviction they had not disclosed.

Verified against the exact strings the browsers post — 23 assertions over the
five public schemas, covering both the unticked (`"false"`) and ticked
(`"true"`) cases, each consent gate refusing `"false"`, `safeToContact` holding
"No", and the `hasPriorConviction` tri-state. All pass. `svelte-check` is at 0
errors (88 pre-existing warnings unchanged), `eslint` clean, `vite build`
succeeds.

---

## 3. The anti-spam honeypot is dead code and tells bots they were caught

**Severity: high** (the whole mechanism is inert).

Every schema declares the honeypot as
`website: z.string().max(0).optional().or(z.literal(''))`
(`src/lib/server/forms.ts:376`, `src/routes/donate/schema.ts:54`,
`src/lib/inKind.ts:330`).

Any non-empty value fails `max(0)` **and** fails the `z.literal('')` branch, so
the form is invalid and the handler returns at the "please check the highlighted
fields" branch. The honeypot check that follows —
`src/lib/server/formSubmit.ts:284`, `src/routes/donate/+page.server.ts:190`,
`:399` — is unreachable, because `form.data.website` can only be `''` or
`undefined` when `form.valid` is true.

The effect is the opposite of what the comments describe: instead of "accepted
silently and discarded", a bot gets a 400 with field-level errors, which is
exactly the feedback that lets it learn to leave the field alone.

**Correction to the above:** only **three** of the six honeypots were broken.
`/apply`, `/contact` and `/volunteer` already used `.max(200)` and worked; the
`.max(0)` was in `$lib/server/forms.ts` (every dynamic form), `donate/schema.ts`
and `$lib/inKind.ts`.

**Fixed.** Those three now use `.max(200)`, so the field survives validation and
the explicit check fires.

Verified: posting `website=http://spam.example` to `/donate` returns
`{"type":"success"}` with "Thank you" and the donations count is unchanged.

---

## 4. `/login` open redirect — `//evil.com` passes the guard

**Severity: high.**

`src/routes/login/+page.server.ts:59-62`:

```ts
const redirectTo = event.url.searchParams.get('redirectTo');
// Only same-origin paths — an open redirect on a login form is a
// ready-made phishing step.
throw redirect(302, redirectTo?.startsWith('/') ? redirectTo : '/dashboard');
```

`startsWith('/')` accepts protocol-relative URLs. `?redirectTo=//evil.com`
starts with `/`, and browsers resolve `//evil.com` as `https://evil.com` — so a
staff member who signs in through a crafted link lands on an attacker's page,
having just typed their password. `/\evil.com` behaves the same way in most
browsers.

**Fixed.** The guard is now `/^\/(?![/\\])/`, which requires a leading slash and
rejects a second `/` or `\`.

Verified against a real signed-in POST: `//evil.com` → `Location: /dashboard`,
`/\evil.com` → `/dashboard`, `https://evil.com` → `/dashboard`, and a genuine
`/dashboard/donations` is still honoured.

---

## 5. §3.10 pillar scope is missing on the disbursements screen

**Severity: high.** One of the two rules `AGENTS.md` calls load-bearing.

`disbursements` carries a `pillar_id` (`schema.ts:1108`) and hangs off
`form_submission_id` (`:1102`), so it is case data. But
`src/routes/dashboard/disbursements/+page.server.ts:17-25` builds a plain
`contentCrud` with no `filter`, and `contentCrud.load` applies only
`isNull(deletedAt)` (`src/lib/server/crud.ts:108-114`). A `program_staff`
scoped to Mental Wellness — the role holds `disbursements.read`/`.write` by
default (`src/lib/permissions.ts:217-218`) — sees every disbursement in every
pillar, with beneficiary, amount and narrative.

The same load leaks two more cross-pillar lists into the pickers:

- `:36-41` — every beneficiary name (up to 500).
- `:42-47` — every case reference number (up to 500).

And the `add`/`edit` actions accept any `formSubmissionId` and `pillarId`, so a
scoped caseworker can also attach a disbursement to another pillar's case.

**Fixed**, in `contentCrud` rather than in the one screen, because the latent
half below is the same bug.

- New `pillarColumn` option folds the scope into the list **and** into `add`,
  `edit` and `delete`. An edit checks both ends — the row as it stands, so
  another programme's record cannot be edited, and the values coming in, so a
  record cannot be pushed into a programme the user cannot see.
- New `beforeWrite` hook, used here to read `pillar_id` back from the case the
  payment is against. Without it the check had a hole the size of the field it
  checks: post another pillar's `formSubmissionId` with `pillarId` blank and the
  row lands with a null pillar, visible to everyone.
- The beneficiary and case pickers are scoped to cases the user can already
  open; the pillar picker to pillars they are assigned to.
- The checks sit _outside_ the actions' `try`, so a refusal is a 403 with its
  real message rather than being swallowed by the catch and reported as
  "Could not add".

**One bug found while testing this fix.** The first version keyed on
`pillarColumn.name`, which is the _database_ name (`pillar_id`). Validated form
data is keyed by the Zod schema's camelCase, and a Drizzle `select()` row by the
table's property name — so both lookups read `undefined` and every check was a
silent no-op. It looked right and refused nothing: a scoped caseworker could
still edit, delete and create across pillars. It now resolves the property name
off the table object and throws at construction if the column does not belong to
the table.

Verified with a `program_staff` scoped to Medical Hardship, against
disbursements in two pillars plus one with no pillar:

| action                            | before                     | after                                                 |
| --------------------------------- | -------------------------- | ----------------------------------------------------- |
| list                              | all three rows             | own pillar + the null-pillar row; other pillar hidden |
| edit another pillar's row by id   | 200, `paid_to` overwritten | **403**                                               |
| delete another pillar's row by id | 200, soft-deleted          | **403**                                               |
| add into another pillar           | 200, row created           | **403**                                               |
| edit / add in own pillar          | 200                        | 200                                                   |

Four `pillar_scope` denials were written to `audit_log`, and an unrestricted
`super_admin` still sees all three rows.

---

## 6. CSV/print export bypasses `data.export` and writes no audit row

**Severity: high** for a system whose spec (§3.11) requires every case read to
be logged.

`src/lib/components/Table/table-export.svelte` scrapes the rendered
`<table>` out of the DOM and hands back CSV or a print window. It is rendered
unconditionally by `data-table.svelte:389`, which is used by
`dashboard/applications`, `dashboard/volunteers`, `dashboard/donors`,
`dashboard/audit` and others.

- The `data.export` permission (`src/lib/permissions.ts:76`) is declared, is
  granted to `finance` (`:103`) — and is **checked nowhere**. `program_staff`,
  who does not hold it, can export the case list.
- The `exported_data` audit action (`src/lib/server/audit.ts:76`) is likewise
  declared and never written. Bulk-exporting a pillar's caseload leaves no
  trace, while opening a single case does.

**Fixed.** New `POST /dashboard/export` requires `data.export` and writes the
`exported_data` audit row; the component asks it first and exports only on a
200, and hides the control entirely when the permission is absent.

The honest limit, which is stated in the endpoint's comment: the export is still
a DOM scrape, so someone determined to keep the rows can copy what is on their
screen. That is true of any rendered page. What this fixes is that the ordinary
act of exporting is now gated and recorded.

Verified: `program_staff` → **403** plus a `permission_denied` audit row naming
`data.export`; `super_admin` → 200 plus an `exported_data` row
(`{"table":"applications","format":"csv","rows":42}`); anonymous → 302 to login.

---

## 7. `acceptApplication` can create a beneficiary in the wrong person's name

**Severity: high.** This is the failure `AGENTS.md` singles out ("a daughter
applying for her mother … every disbursement afterwards is recorded against the
wrong person"), reintroduced through the matching key.

`src/lib/server/apply.ts:521`:

```ts
const phone = subject?.phone?.trim() || submission.phone?.trim() || null;
```

`submission.phone` is `submitted_by_phone` — the **applicant's** number. When
someone applies on behalf of another person and does not supply a separate phone
for the subject (every field on `/apply` except name, contact and story is
optional by design), that number is then used at `:526-533` as the _match key_:

- if the applicant already has a beneficiary record, the mother's case is linked
  to the **daughter's** beneficiary row, and
- if not, a new beneficiary is created carrying the daughter's phone, so the
  next case that daughter files for anyone else matches it too.

The same fallback is applied to `fullName` at `:519`, but there it is harmless —
`applicationSubjects.fullName` is always populated by `createApplication:342`.

**Fixed.** The applicant's phone is used only when the subject _is_ the
applicant. Applying on someone else's behalf with no phone for them now falls
through to the name + date-of-birth match and creates the record with a null
phone rather than a borrowed one.

---

## 8. Legacy volunteer submissions email staff a link to an unrelated case

**Severity: medium.**

`src/lib/server/formSubmit.ts:298-307` routes a `volunteer`-context submission to
`submitVolunteerApplication`, which returns a `volunteer_applications.id` — then
calls `notifyNewSubmission(definition.slug, result)` for **both** branches.

`src/lib/server/notify.ts:52` builds:

```
Open it here: {origin}/dashboard/applications/{result.id}
```

So a volunteer application taken through `/forms/volunteer-application` sends
staff to `/dashboard/applications/<volunteer id>` — either a 404 or, worse, a
completely unrelated assistance case that happens to share the id. The correct
helper, `notifyNewVolunteer` (`notify.ts:69`), builds
`/dashboard/volunteers/{id}` and is only wired to `/volunteer`
(`src/routes/volunteer/+page.server.ts:165`).

**Fixed.** The notification now follows the same branch as the write.

Verified by posting the legacy `/forms/volunteer-application`: the mail is
`New volunteer application — SAF-VOL-2026-0002` from `notifyNewVolunteer`
(linking to `/dashboard/volunteers/…`), not the `notifyNewSubmission` subject
that pointed at `/dashboard/applications/…`.

---

## 9. A contact reply whose email bounces is still stamped as answered

**Severity: medium.** Code contradicts its own docstring.

`src/lib/server/contact.ts` (docstring at the top of `addContactReply`):

> The send happens before the timestamp is written, so a bounced reply does not
> leave the message looking answered.

The send does happen first, and its failure is caught and recorded as
`sentAt: null` — but the stamp at `:151` keys on `isInternal` alone:

```ts
if (!input.isInternal && !message.firstRespondedAt) { … firstRespondedAt … }
```

`emailed` is never consulted. An SMTP failure therefore leaves the message with
a `first_responded_at`, so it drops out of "awaiting a reply" and the response-
time figure counts a reply nobody received.

**Fixed** exactly as described: `(emailed || !shouldEmail)`. A logged phone call
or in-person conversation still stamps — nothing was meant to be sent, so
nothing failed — while an email that did not go does not mark the message
answered.

---

## 10. Public impact counters are keyed on pillar slugs by substring

**Severity: medium.** Breaks §0 ("nothing a non-technical staff member might
want to change is hardcoded").

`src/lib/server/impact.ts:123-127`:

```ts
const forPillar = (slugFragment: string) =>
	Number(byPillar.find((row) => row.slug.includes(slugFragment))?.value ?? 0);

results[METRIC.STUDENTS_SPONSORED] = forPillar('youth');
results[METRIC.ELDERS_CARED_FOR] = forPillar('elder');
```

`pillars.slug` is editable from Configuration. Renaming `youth-education` to
`education` silently zeroes a homepage counter with no error anywhere, and
`.includes` means two pillars containing the fragment resolve to whichever
happens to sort first.

Related, same function: `FAMILIES_SUPPORTED` (`:78-81`) is
`countDistinct(submittedByBeneficiaryId)`, and SQL `COUNT(DISTINCT …)` ignores
NULLs — so every supported case where a caseworker never pressed "link
beneficiary" is invisible to the public figure.

**Fixed** with settings keys rather than a column, so it needs no migration and
stays editable by staff, which is what §0 asks for:
`impact.pillar_students_sponsored` and `impact.pillar_elders_cared_for` hold the
pillar slug, defaulting to the seeded values so existing installations keep
working. Matching is exact, and a slug naming no pillar logs a warning naming
the setting to correct.

The count is now
`count(distinct coalesce('b' || beneficiary_id, 's' || submission_id))`, so a
supported case nobody linked to a beneficiary counts as one family instead of
zero.

**One bug found while testing this fix.** The warning first fired on any pillar
with no _supported cases yet_ — true of a fresh install — which would have cried
wolf on exactly the installations least able to judge it. It now warns only when
the slug matches no pillar at all, which is what a renamed slug looks like.
Confirmed silent against a real database whose slugs are correct.

---

## 11. `/files/[name]` caches private-file rows against its own comment

**Severity: medium.**

`src/routes/files/[name=filename]/+server.ts:243-258` is introduced by

> Public rows are cached; a private row is looked up fresh every time.

but `cached()` wraps the lookup unconditionally, with the 60 s default TTL. The
permission check itself does run per request, so this is not an authorisation
bypass — but for up to a minute after a change:

- a file soft-deleted through `deleteStoredFile` still resolves and streams (the
  bytes are unlinked, so this surfaces as a 404 from `getCachedStats`, or as a
  stale hit if the unlink failed);
- a file whose `pillar_id` was corrected is still checked against the old pillar,
  so the wrong caseworkers are admitted (or the right ones refused).

**Fixed.** The row is read first and cached only when it is public. That needed
a `peek()` on the cache module — a read that does not populate — because
`cached()` commits to storing whatever the loader returns and so cannot express
"decide after loading".

---

## 12. `withReference()` exists to make reference allocation atomic and is never called

**Severity: low-medium.**

`src/lib/server/reference.ts:329-335` documents the hazard precisely —
"two concurrent inserts could read the same maximum, which is not [harmless]" —
and exports `withReference` to close it. Nothing imports it. Every call site
computes the reference and then awaits the insert separately:

`submissions.ts:96`, `contact.ts:175`, `inKind.ts:267`, `volunteers.ts:448,656`,
`apply.ts:337`, `donate/+page.server.ts:292`, `pledges/+page.server.ts:92`.

Today this is survivable: the reads and the inserts are close enough that Node's
microtask ordering keeps them together, and all five reference columns are
`unique` (`schema.ts:729,1333,1510,1820,2386`), so a genuine collision surfaces
as a 500 rather than as two records sharing a number. But the defence is
accidental — inserting any I/O-bearing `await` between the two lines opens the
race for real.

Also in `nextSequence` (`:257-269`): `substr(column, -4)` reads only the last
four characters, so the series silently restarts once a prefix passes
`SAF-XXX-YYYY-9999` in one year.

**Fixed**, both halves.

Reference allocation now happens inside the transaction that consumes it at all
eight call sites. Three (`apply`, `volunteers`, `inKind`) already had a
transaction and the generator simply moved inside it; the other five now use
`withReference`, which had been written for exactly this and called by nothing.

`nextSequence` reads `substr(column, pattern.length + 1)` instead of
`substr(column, -4)`. Verified against SQLite by walking a series past 9999: the
old expression reads `SAF-MED-2026-10000` back as `0000`, so it re-allocates
`10000` forever against a UNIQUE column and the series is stuck; the new one
reached `SAF-MED-2026-10003` over 10,003 inserts with no collision, and still
ignores other years.

Also verified with 12 concurrent `/contact` posts: 12 messages, 12 distinct
references.

---

## 13. Smaller items

All fixed.

- **`recomputeSafeguarding` returns false when the checklist is empty.** Kept
  fail-safe, but the message no longer sends a coordinator hunting for a list
  that does not exist: with zero active checklist items it now says none have
  been set up and names the screen to add them.

- **`toggleCheck` / `verifyCredential` did not validate the route param.** Both
  now guard `Number.isFinite(id)` like the shared `guard()` helper, so a
  non-numeric id is a 404 rather than a `NaN` reaching the insert as a 500.

- **Soft-deleted case documents still rendered.** The applications detail load
  now filters `formSubmissionDocuments.deletedAt` as well as `files.deletedAt`,
  so it agrees with `getApplicationDetail`.

- **`upsertDonor` matched emails case-sensitively.** Normalisation moved inside
  the function (trim + lowercase, on the phone too) rather than relying on all
  three callers to remember. Verified: a donation from `Aster.Real@Example.COM`
  stores `aster.real@example.com`.

- **In-kind photos were unreachable for pillar-scoped staff.** `/files` now
  authorises a private file either as a case document (`submissions.read` plus
  pillar scope, unchanged) or as an in-kind photo (`inkind.read`, checked
  against `in_kind_donation_photos` only on the fallback path). A general-fund
  offer carries no pillar, so every scoped caseworker was refused, and a finance
  user with `inkind.read` but not `submissions.read` was refused outright.

- **`login` audit rows had no user id.** `audit()` takes an optional `userId`
  for the case where `event.locals` cannot know yet, and the login action
  resolves the id from the email. Verified: `login` rows now carry the user id.

- **`auto_vacuum = INCREMENTAL` set after creation is a no-op.** Kept, since it
  does work on a fresh database, but the comment now says plainly that it is
  inert on an existing `local.db` and that the hourly `incremental_vacuum` is
  consequently reclaiming nothing there.

- **Money conversions bypassed `$lib/money.ts`.** All five inline
  `Math.round(x * 100)` sites now go through `toMinor`.

- **No size ceiling on `saveUploadedFile`.** A 10 MB ceiling is enforced in the
  storage layer, matching the per-field limit the dynamic form applied — so
  `/apply`'s documents and the in-kind photos, which never passed through that
  schema, are bounded too. The constant now lives in `upload.ts` and is
  re-exported by `forms.ts` rather than being declared twice.

- **88 `state_referenced_locally` warnings.** Left alone. They are pre-existing,
  none currently misbehave, and touching 47 files to silence them is out of
  proportion to this pass — worth its own change.

---

## What was verified, and how

The fixes were exercised against a running instance backed by a **copy** of
`local.db` (`/tmp/smoke.db`); the real database was never written to. In
addition to the HTTP evidence quoted above:

- 23 zod assertions over the five public schemas, covering unticked (`"false"`)
  and ticked (`"true"`) for every boolean, each consent gate refusing `"false"`,
  `safeToContact` holding "No", and the `hasPriorConviction` tri-state.
- The dynamic-form consent gate end to end: a required checkbox posted as
  `false` is refused with "… is required" and stores nothing; posted as `true`
  it is accepted and stored as a real boolean.
- Every major public page and all 34 dashboard screens return 200 for a
  `super_admin` after the `contentCrud` changes.
- The suspension path in full, including the case that matters most — Better
  Auth **does** let a suspended account sign in again, and the guard catches it
  on the next request, signs them out, redirects to `/login?suspended=1` and
  audits it.

Two of the fixes were themselves wrong on the first attempt and were caught by
this testing rather than by review: the `pillarColumn` name mismatch in #5,
which refused nothing at all, and the false-positive impact warning in #10.
Both are described under their entries.
