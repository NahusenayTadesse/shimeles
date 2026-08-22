# Usability review

A read of the public site and the dashboard, looking for what will confuse
people, waste their time, or quietly mislead them. Where something is a matter
of judgement rather than a defect, it says so.

> **Status: all eleven findings have since been acted on.** The text below is
> kept as written — it is the record of what was wrong and why it mattered.
> What changed, per item:
>
> 1. Leave-guard restored on `/apply`, `/volunteer` and the in-kind form, and
>    (1b) drafts saved to the device behind an explicit "continue or start
>    again" banner, two-day expiry, never restored silently.
> 2. A failed submit now focuses the first invalid field; summary rows link to
>    their controls (`$lib/formComponents/form-errors.ts`).
> 3. `src/routes/+error.svelte` and `src/routes/dashboard/+error.svelte`.
> 4. All seven screens routed through `searchFilter()`.
> 5. Stat blocks are a repeater, not a JSON textarea, and `is_money` is derived
>    from the metric in `$lib/metrics.ts` rather than typed.
> 6. Empty states distinguish filtered / genuinely empty / no programme
>    assigned; the `font-2xl` typo is fixed.
> 7. One `$lib/dates.ts`, `22 Aug 2026`, used by all 31 call sites.
> 8. `InputComp` turns the year dropdown on for any birth/dob field, and the
>    picker takes typed entry.
> 9. ⌘K / Ctrl-K, and a `/dashboard/search` endpoint that searches records
>    under each entity's read permission, pillar scope and the audit log.
> 10. Option 1: the confirmation says what happens next and who to call.
> 11. Inline confirmations alongside the toasts on the three screens that
>     needed them; 12-hour rolling sessions; the asterisk explained on
>     `/apply`; the export control disabled-with-a-reason rather than hidden;
>     `/setup` says it is a one-time screen; bulk reviewer assignment on the
>     applications table.

Two audiences, and they are not the same person:

- **Applicants, donors, volunteers** — often on a phone, often once, sometimes
  in the middle of a crisis. Every extra step loses some of them for good.
- **Foundation staff** — the same eight screens every day. For them the cost
  is not confusion, it is repetition and silent mistakes.

Ordered by what I would fix first.

---

## 1. A half-filled application is lost by one stray tap

**Severity: high.** `/apply` is 951 lines and `/volunteer` is 1071. Someone can
easily spend twenty minutes on either.

All six public forms set `taintedMessage: null`
(`apply/+page.svelte:78`, `volunteer/+page.svelte:77`,
`donate/+page.svelte:29`, `contact/+page.svelte:36`,
`InKindForm.svelte:89`, `DynamicForm.svelte:41`), which switches off the
browser's "you have unsaved changes" prompt. There is no draft, no
`localStorage`, no autosave — I checked. Back button, a mistyped URL, a tapped
link in the header, a phone that decides to reload the tab: everything is gone,
with no warning and nothing to recover.

That is a reasonable setting on `/contact`, which is four fields. On the two
long forms it is the difference between an application and a person giving up.

**Suggested fix**, cheapest first:

1. Turn the guard back on for `/apply`, `/volunteer` and the in-kind form —
   `taintedMessage: 'You have not finished this form. Leave anyway?'`. One line
   each. (It was presumably set to `null` because the prompt fires on the
   _successful_ submit navigation too; the fix for that is to clear the tainted
   state in the success branch, not to disable the guard.)
2. Then a draft: serialise `$form` to `localStorage` on a debounce, restore it
   on mount behind a visible "We saved what you had typed — continue or start
   again?" banner. Never restore silently; a returning user seeing a form
   pre-filled with someone else's answers on a shared phone is worse than the
   loss.

Do not put drafts of `/apply` in `localStorage` without thinking about the
shared-device case — the content is medical and household detail. A short TTL
and an explicit "clear" control are the minimum.

---

## 2. Failing validation on a long form leaves you nowhere

**Severity: high.**

Submit `/apply` with something missing and the only feedback is a toast
(`apply/+page.svelte:84-92`). The error summary (`<Errors>`) sits at the very
top of the form, roughly 600 lines above the submit button, and nothing scrolls
you to it. The toast then fades. On a phone the user is left staring at an
unchanged submit button with no idea what is wrong.

The success path _does_ scroll (`window.scrollTo` at `:91`) — so the page
scrolls when you no longer need it to, and does not when you do.

**Suggested fix:**

- On `$message.type === 'error'`, scroll the `<Errors>` block into view and
  move focus to it (`element.focus()` on a `tabindex="-1"` container), which
  also announces it to a screen reader.
- Make each row in `Errors.svelte` a link to `#<field-id>`. Every control now
  has a real `id`, so `href="#applicantName"` works — that was not true before
  the form components landed, which is probably why the summary is inert.
- Better still, scroll to the _first_ invalid field rather than the summary.
  `$allErrors[0].path` gives you the name.

The same applies to `/volunteer` and the in-kind form, which share the pattern.

---

## 3. Staff hit a bare black error page with no way back

**Severity: high** — and it got more likely with the recent pillar-scope work.

There is **no `+error.svelte` anywhere in the project**. Every 403, 404 and 500
renders SvelteKit's built-in page: a status code and a message on a white
background, with no header, no navigation, and no link home.

That page is now reachable on ordinary paths:

- A caseworker opening a case outside their programme — 403 "This case belongs
  to a programme you do not have access to."
- The same on a disbursement, since scope was folded into that screen.
- A stale link to a deleted record — 404.
- A suspended account (that one redirects, so it is fine).

A staff member who clicks a colleague's link to the wrong case has to use the
browser back button to escape, and nothing tells them the case exists but is
not theirs versus does not exist at all.

**Suggested fix:** add `src/routes/dashboard/+error.svelte` and
`src/routes/+error.svelte`. Dashboard version: keep the sidebar, show
`$page.error.message` (the server messages are already written for humans —
"This case belongs to a programme you do not have access to"), and offer "Back
to the dashboard" plus "Ask an administrator for access". Public version:
match the site's design and offer the four programmes and the contact page,
since a 404 there is usually someone following an old link to a service.

---

## 4. Search silently returns the wrong rows

**Severity: medium-high**, because it is invisible. Nobody reports a search
that quietly matched too much.

`$lib/server/query.ts` has `searchFilter()`, which escapes `%`, `_` and `\`
before building the `LIKE` pattern — with a comment explaining exactly why. It
is used on **one** screen (blog).

Seven screens hand-roll `like()` without escaping: **messages, in-kind, audit,
applications, volunteers, donations, newsletter**
(e.g. `applications/+page.server.ts:83-89`).

So on the case board:

- Searching `%` matches every application.
- Searching `_` matches every application.
- A phone number typed with an underscore, or a message search for "50%",
  returns results that look plausible and are wrong.

**Suggested fix:** replace each hand-rolled `or(like(...), like(...))` with
`searchFilter(term, [col, col, ...])`. It returns `undefined` for an empty
term, which `and()` already drops, so the call sites get shorter as well as
correct.

---

## 5. Homepage statistics are hand-typed JSON, and one missing key inflates a figure 100×

**Severity: medium-high.** This is the one most likely to embarrass the
Foundation publicly.

Stat blocks on a page are edited as **raw JSON in a textarea**
(`dashboard/pages/[id]/+page.server.ts:81`, `:143-147`). The dashboard's own
help text asks a non-technical staff member to type:

> Add `"is_money": true` to format it as currency.

`BlockRenderer.svelte:184-192` branches on that flag: with it, the value goes
through `formatMoney` (which knows the number is in santim); without it, it
goes through `formatCompact`, which formats the raw integer.

`funds_raised` is stored in **santim**. So a comms person who adds a
"Funds raised" stat and forgets `is_money` publishes:

| stored    | with `is_money` | without |
| --------- | --------------- | ------- |
| `1234567` | `ETB 12,345.67` | `1.2M`  |

A hundredfold overstatement of money raised, on the homepage, with no error
anywhere. And the failure mode of the JSON textarea itself is a block that
silently stores `{}` when the JSON is malformed.

This also sits badly against §0 of `AGENTS.md` — the value is not hardcoded,
but "editable by a non-technical staff member" is not satisfied by a JSON
textarea.

**Suggested fix:**

- Replace the JSON textarea for `stats` with a small repeater: a metric
  dropdown (the `METRIC` keys are a fixed list), a label input, and a "this is
  money" checkbox. Ten minutes of UI removes a whole class of error.
- Independently, make it impossible to get wrong: derive `is_money` from the
  metric rather than trusting the flag. `funds_raised` is the only money
  metric, and `impact.ts` already knows that — it writes `currency: 'ETB'` on
  exactly that row.

---

## 6. "Nothing found here" does not say which nothing

**Severity: medium.**

Every table renders the same empty state — a bouncing frown and
"Nothing found here." (`Table/data-table.svelte:436-443`). It cannot tell
apart:

- a genuinely empty table on a fresh install ("no beneficiaries yet"),
- a filter that matched nothing ("no applications in _Mental Wellness_ with
  status _Approved_"),
- a pillar-scoped user who has no assignments at all, and will see this on
  every case screen until someone assigns them a programme.

The third is the worst: a new caseworker's first impression of the system is an
empty board with a bouncing frown, and nothing anywhere says "an administrator
has not given you access to a programme yet."

While in there: the cell uses `class="font-2xl text-center"`. **`font-2xl` is
not a Tailwind class** (it is `text-2xl`), so the message has silently been
rendering at default size.

**Suggested fix:** pass an `emptyState` snippet into the table with a title, a
sentence and an optional action. Three cases worth writing:

- filters active → "No results for these filters" + a _Clear filters_ button
  (`filter-bar.svelte` already has the clear logic).
- no rows at all → "No X yet" + the _Add_ button where the screen has one.
- `access.pillarIds?.length === 0` on a case screen → "You have not been
  assigned to a programme yet. An administrator can do that under
  Configuration → Users."

---

## 7. Dates are shown three different ways

**Severity: medium.** Small, but it is on every screen.

31 separate date-formatting call sites, no shared helper, and they disagree:

| where                                          | locale          | renders               |
| ---------------------------------------------- | --------------- | --------------------- |
| dashboard lists, blog cards, date-range picker | `en-GB`         | `22/08/2026`          |
| **`DatePicker2.svelte:47`**                    | **`en-US`**     | **`August 22, 2026`** |
| `table-export.svelte:82`                       | browser default | anything              |

So a staff member picks a date and sees it in American format, then sees the
same date in the table below in British format. On top of that, `en-GB`
`22/08/2026` and `en-US` `08/22/2026` are indistinguishable for the first
twelve days of any month — a real hazard on a disbursement date.

**Suggested fix:** one `formatDate`/`formatDateTime` in `$lib/money.ts`'s
neighbour (say `$lib/dates.ts`), used everywhere, defaulting to an unambiguous
format — `22 Aug 2026`. Ethiopian offices read both conventions; a written
month removes the question. Keep the Gregorian calendar (the Ethiopian calendar
is a much larger decision and is not v1), but the format should not be
ambiguous.

---

## 8. Entering a date of birth means clicking back one month at a time

**Severity: medium**, and it affects the two places a date of birth is entered.

`DatePicker2` only shows a year dropdown when passed `year`
(`DatePicker2.svelte:63`, `captionLayout={year ? 'dropdown-years' : 'label'}`).

- `/apply` → `subjectDateOfBirth` passes `year`.
- `/volunteer` → `dateOfBirth` (`+page.svelte:398`) **does not**.
- Dashboard → `beneficiaries.dateOfBirth`
  (`beneficiaries/+page.svelte:35`) **does not**.

To enter a birth year of 1985, a volunteer coordinator clicks the back arrow
roughly **490 times**.

**Suggested fix:** pass `year` on every date-of-birth field. Better: have
`InputComp` turn it on automatically when `oldDays` is set and the field name
matches `/birth|dob/i`, so the next one cannot be missed. Consider also
allowing typed entry — a calendar is the wrong control for a date decades in
the past.

---

## 9. The command palette does not find records, and has no shortcut

**Severity: medium.**

`Search.svelte` is a route jumper: it flattens the nav tree and filters it by
permission. It does not search cases, beneficiaries, donors, volunteers or
reference numbers, and there is **no keyboard binding** — it opens by clicking.

Staff will type a reference number or a person's name into it, because that is
what a magnifying glass in a header means. They will get nothing, conclude the
system cannot find their case, and go back to scrolling the board.

**Suggested fix:**

- Bind ⌘K / Ctrl-K, and show the hint in the trigger (`⌘K`). It is one
  `svelte:window onkeydown`.
- Add a records section fed by a small endpoint that searches reference numbers
  and names across submissions, volunteers, donors and messages — respecting
  `pillarScope` and each entity's read permission, and auditing the read like
  every other case read does. A reference number lookup alone would cover most
  of the real use ("someone is on the phone quoting SAF-MED-2026-0142").
- Until that exists, relabel the trigger "Go to…" so it does not promise search.

---

## 10. An applicant is given a reference number they cannot use

**Severity: medium — but this is a judgement call, not a defect.**

`/apply` ends with the reference and the line "Keep this reference. It is how
we find your application when you call." There is no route where an applicant
can enter it. The only channel is the phone.

That is defensible: a reference number alone is a weak credential, and building
a status portal around one would let anyone who guesses a number read case
detail. The current copy is at least honest about it.

But "we will be in touch" with no way to check is hard on someone waiting, and
the registration form promises reassessment at each intake round — a promise
with no visible surface.

**Options, in increasing cost:**

1. Say more in the confirmation: what happens next, roughly how long, and the
   phone number to quote it to. Costs nothing and removes most of the anxiety.
2. A status page keyed on **reference + the phone number given on the form**,
   showing only a stage ("received", "being assessed", "waitlisted") and never
   case content.
3. Nothing, and make sure the phone number is prominent — a legitimate choice
   for v1. If so, at least do (1).

---

## 11. Smaller things

- **Toasts are the only record of an outcome.** `svelte-sonner` is configured
  with `closeButton` (`+layout.svelte:38`) but the default timeout still
  applies, and several actions report success only that way. Anyone who looks
  away misses it. For destructive or slow actions (status change, reconcile,
  intake) prefer a persistent inline confirmation next to the thing that
  changed.

- **Session length is unconfigured.** `auth.ts` sets no `session.expiresIn`, so
  Better Auth's 7-day default applies to a system holding medical and
  mental-health case data, often on shared office machines. Worth a deliberate
  decision rather than a default — 12 hours with a rolling refresh would suit
  an office.

- **The asterisk on `/apply` means two different things.** Fields marked `*`
  are not HTML-`required` (deliberately — §3.3 low-barrier), so the browser
  will not stop a submit, but the server will reject it. A user can press
  submit, get a toast, and not connect it to the asterisks far above. Fixing
  #2 largely resolves this; a line under the heading saying "we can work with
  gaps, but the starred questions we do need" would help too.

- **The export control now disappears entirely** for staff without
  `data.export`, rather than appearing disabled. Someone who used it last week
  will think it broke. A disabled button with a tooltip ("Exporting needs the
  data-export permission") is kinder than a vanished one.

- **`/setup` is unauthenticated by design** and closes after the first account.
  Worth stating on the page itself that this is a one-time screen and what to
  do if it was reached in error — right now it looks like an ordinary signup
  page, which is exactly the thing the system otherwise refuses to offer.

- **Long lists have no bulk actions.** Assigning a reviewer to thirty
  applications after an intake round is thirty page loads. The table already
  supports row selection; a "assign selected to…" action would use it.

---

## What I would do in what order

| #   | Change                                                | Effort    | Who benefits                 |
| --- | ----------------------------------------------------- | --------- | ---------------------------- |
| 3   | Add the two `+error.svelte` pages                     | ~1h       | staff, daily                 |
| 2   | Scroll and focus the error summary; link the messages | ~2h       | every applicant who mistypes |
| 4   | Route the seven searches through `searchFilter`       | ~1h       | staff, silently today        |
| 1   | Re-enable the unsaved-changes guard                   | ~30m      | applicants                   |
| 8   | Pass `year` on the date-of-birth pickers              | ~15m      | coordinators                 |
| 6   | Real empty states                                     | ~2h       | new staff especially         |
| 5   | Stat block editor + derive `is_money`                 | ~3h       | prevents a public error      |
| 7   | One shared date formatter                             | ~2h       | everyone, quietly            |
| 1b  | Drafts on the long forms                              | ~half day | applicants                   |
| 9   | ⌘K and record search                                  | ~1 day    | staff, daily                 |

Items 3, 4, 8 and 1 are together under half a day and remove the sharpest
edges. Item 5 is the one to do before the next time someone edits the homepage.
