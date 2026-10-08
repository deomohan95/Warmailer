# Warmailer — User Manual

What the app is, what every screen does, and how the production workers are expected to behave.

**Code review date: 2026-10-06.** The live enrichment systemd service runs this repository at `/root/Warmailer`.

**Status: live production app.** Leads import into Supabase, email finding runs through the worker,
emails are verified with Reoon before new results are saved, campaigns send through connected
mailboxes, and replies/bounces sync back into the inbox.

---

## What Warmailer is for

Warmailer runs cold outbound email for several client workspaces at once:

1. Leads are imported from an Apollo CSV export.
2. Missing email addresses are found through saved company formats, the bulk Apify finder,
   same-company pattern guesses, and the one-by-one Apify fallback.
3. New found email addresses are verified through Reoon before they are saved for campaign use.
4. Campaigns send through connected Zoho mailboxes.
5. Replies from every mailbox land in one shared inbox.
6. A mailbox's hard limits cap what any campaign can send through it.

Point 6 is the rule the whole interface is built around. It is covered in its own section below.

---

## Running the app

From the repository root:

```powershell
npm.cmd run dev
```

Then open <http://127.0.0.1:3000>. Other commands:

| Command | What it does |
|---|---|
| `npm.cmd --workspace @warmailer/web test` | Runs the invariant tests |
| `npm.cmd --workspace @warmailer/web run typecheck` | Type-checks the app |
| `npm.cmd --workspace @warmailer/web run build` | Production build |
| `npm.cmd run lint` | Lints the repository |

### Seeing populated screens

Screens load records for the active workspace. A workspace without records shows empty states;
the app does not invent traffic numbers. To view the populated layouts, open
`apps/web/lib/demo.ts` and set:

```ts
export const demoMode = true;
```

The seeded records are recognisable on sight — `seed_*` identifiers and `example.com` addresses —
and carry the same metadata fields the real backend will supply. **Set it back to `false` when you
are done.**

---

## Getting around

A fixed left sidebar holds exactly six modules, and never grows beyond them:

**Dashboard · Leads · Campaigns · Inbox · Mailboxes · Settings**

Everything else is a nested flow reached from inside one of those six. Importing leads lives
inside Leads; creating a campaign lives inside Campaigns; warmup lives inside Mailboxes; billing
lives inside Settings. None of them get their own sidebar entry.

The top bar carries the active workspace, a disabled search box, a theme toggle and a logout button.

Below 1024px the sidebar collapses behind a menu button. Every screen stays usable down to 820px,
where two-column layouts fold to one.

### Light and dark

The circle button in the top bar switches theme. Your choice is remembered in the browser, and a
small script runs before the page paints so a dark theme never flashes light on reload. If you
have never chosen, the app follows your operating system setting.

---

## Dashboard

The state of the outbound system in one screen. It answers "what is set up, what can send, and
what is stopping me".

The dashboard shows campaign activity from stored send, open, reply and bounce events, with
campaign filtering. Open rate is labelled **estimated**: image blocking and prefetch can distort
pixel-based opens. Mailbox capacity and launch blockers are calculated from connected mailboxes
and workspace records. Empty workspaces show setup prompts rather than invented activity.

Setup prompts and links point to Leads, Mailboxes and Campaigns as appropriate.

---

## Leads

Manages every lead in the workspace, and the enrichment that finds their email addresses.

### Importing

The importer only requires these columns:

```text
name,link,company
```

The **Imports** card lists past imports with rows imported and duplicates skipped.

### Filtering and selecting

Filter by free-text search (name, company, job title), email status, industry and location.
Selection works three ways: individual rows, everything on the page via the header checkbox, or
**Select all N filtered** to take the entire filtered set beyond the visible page.

### Finding emails

With leads selected, a bar appears showing the live count split into what will actually be
processed:

- **eligible for enrichment** — no email address yet, and not suppressed
- **already have an email** — skipped, never re-enriched
- **suppressed** — skipped

**Find emails** acts only on the eligible group. Current runs verify inside the worker before
saving a newly found address. The order is:

1. **Known company format first.** Warmailer checks saved/derived company email formats. If a
   company already has a verified pattern, it guesses the new lead's email and sends that guess to
   Reoon. Only safe/valid guesses are saved, directly as **Verified**.
2. **Bulk Apify second.** Still-missing LinkedIn URLs go to
   `snipercoder/bulk-linkedin-email-finder` (`APIFY_BULK_ACTOR_ID`, input key
   `linkedin_url_or_ids`).
3. **Verify bulk results.** Every bulk-found email is checked with Reoon before saving. Safe/valid
   results save as **Verified** and teach Warmailer that company's email pattern.
4. **Same-batch company guesses.** If bulk finds one verified address at a company, Warmailer uses
   that format to guess emails for the other missing leads from the same company, then verifies
   those guesses with Reoon before saving.
5. **One-by-one fallback last.** Leads still missing an email go to
   `snipercoder/linkedin-email-finder` (`APIFY_LINKEDIN_EMAIL_FINDER_ACTOR_ID`) one LinkedIn
   profile at a time.
6. **Verify fallback results.** One-by-one results also must pass Reoon before saving. If no safe
   address is found, the lead stays empty and becomes **Not found** or **Failed**, depending on the
   worker result.
7. **No duplicate verification in one run.** The same lead/email candidate is checked with Reoon
   only once per worker run, even if multiple phases return the same address.

The old “find first, verify later” path is legacy only. New **Find emails** runs should not save a
fresh Apify or guessed address as campaign-ready unless Reoon says it is safe/valid.

### Using TryKitt's API manually

`TRYKITT_API_KEY` is stored in the ignored `.env.local` file and is shown as an empty placeholder
in `.env.example`. The key was checked with TryKitt's `GET /api/test-key` endpoint. Warmailer's
**Find emails** and **Verify emails** buttons do not call TryKitt: the current worker uses Apify to
find addresses and Reoon to verify them. A TryKitt result must not be written to a lead as
**Verified** through an ad hoc database update; use the existing verification path or add a
reviewed integration that maps TryKitt's response to Warmailer's status rules.

For a manual TryKitt lookup, load the local environment in a shell at the repo root, then send a
real-time request with the lead's full name, company email domain (or website), and optional
LinkedIn URL. `customData` can hold your internal lead id so results can be matched back to a
lead. Do not put an API key in request bodies or source files.

```bash
set -a; . ./.env.local; set +a
curl -sS https://api.trykitt.ai/job/find_email \
  -H "x-api-key: $TRYKITT_API_KEY" -H 'Content-Type: application/json' \
  --data '{"fullName":"Example Person","domain":"example.com","linkedinStandardProfileURL":"https://www.linkedin.com/in/example-person","realtime":true,"customData":"internal-lead-id"}'
```

To check an existing candidate address through TryKitt directly:

```bash
curl -sS https://api.trykitt.ai/job/verify_email \
  -H "x-api-key: $TRYKITT_API_KEY" -H 'Content-Type: application/json' \
  --data '{"email":"person@example.com","realtime":true,"customData":"internal-lead-id"}'
```

TryKitt's published collection does not document example result bodies or which verification
field Warmailer should treat as safe. Its field list says `website` is required while its find
request example supplies `domain`; the example above follows the published request example.
Check actual responses before mapping results into Warmailer. The default limit is 15 concurrent
real-time requests per key; HTTP 402 can mean rate limiting or insufficient funds. These calls
may consume TryKitt credits.

References: [TryKitt API collection](https://help.trykitt.ai/en/collections/12464484-api-docs),
[Postman endpoint reference](https://documenter.getpostman.com/view/479833/2s93m62NHf), and
[rate limits](https://help.trykitt.ai/en/articles/11185667-api-rate-limits).

Actors and external services used by this flow:

| Phase | Service / actor | Env/config | Input |
|---|---|---|---|
| Saved/derived company format | Warmailer pattern logic | `company_email_patterns` when present; otherwise existing verified leads | Lead name + company/domain pattern |
| Guess verification | Reoon | `REOON_API_KEY`, `REOON_MODE=power` by default | Email candidate |
| Bulk finder | Apify `snipercoder/bulk-linkedin-email-finder` | `APIFY_BULK_LINKEDIN_EMAIL_FINDER_ACTOR_ID` or `APIFY_BULK_ACTOR_ID`; default actor name `snipercoder/bulk-linkedin-email-finder`; `APIFY_BULK_INPUT_KEY=linkedin_url_or_ids` | Batch of LinkedIn URLs |
| Bulk result verification | Reoon | `REOON_API_KEY`, `REOON_MODE` | Every email returned by bulk |
| Same-company pattern guesses | Warmailer pattern logic | Learned from verified bulk/known emails only; free domains are ignored | Lead name + learned company domain/pattern |
| One-by-one fallback | Apify `snipercoder/linkedin-email-finder` | `APIFY_LINKEDIN_EMAIL_FINDER_ACTOR_ID`; default actor ID `UMdANQyqx3b2JVuxg`; `APIFY_PRIMARY_INPUT_KEY=linkedin` | One LinkedIn URL per call |
| One-by-one result verification | Reoon | `REOON_API_KEY`, `REOON_MODE` | Every email returned by fallback |
| Legacy manual recovery fallback | Apify `x_guru/linkedin-email-Scraper-no-cookies` | `APIFY_LINKEDIN_EMAIL_SCRAPER_ACTOR_ID`; default actor ID `q3wko0Sbx6ZAAB2xf`; `APIFY_FALLBACK_INPUT_KEY=linkedinUrls` | LinkedIn URLs |

### Verifying emails

The **Verify emails** button remains for older leads already marked **Email found**. New **Find
emails** runs verify inside the worker and save safe/valid results directly as **Verified**.
Campaigns can only use **Verified** leads. The manual button checks at most 500 selected
leads per request and only processes leads with an address and **Email found** status. Rejected
addresses stay unverified; request errors are reported separately.

The shared Reoon check accepts `is_safe_to_send === true` or a `status` of `safe` or `valid`.
Other responses do not promote a lead to **Verified**. Without `REOON_API_KEY`, enrichment
verification returns unverified and saves no new candidate; the manual verification endpoint
reports a configuration error. Candidate checks are cached by lead id and lowercase email
within each worker run. This review checked code and automated tests, not a new paid Reoon run.

Results write back with the enrichment batch that produced them, so any address can be traced to
its source.

### Lead statuses

| Status | Meaning |
|---|---|
| Not enriched | No enrichment attempted |
| Queued | Waiting for an enrichment run |
| Processing | Enrichment in progress |
| Email found | Stored address awaiting verification; used by older/imported records |
| Verified | Address found and passed Reoon verification |
| Not found | Enrichment ran and found nothing |
| Failed | Enrichment errored |
| Suppressed | Must never be contacted |

---

## Campaigns

Lists every campaign with its status, selected lead count, selected mailbox count, daily capacity
and last activity. With none created it reads:

```text
No campaigns yet. Create a campaign after importing leads and connecting mailboxes.
```

Statuses: **Draft · Scheduled · Sending · Paused · Completed · Failed**.

### Creating a campaign

**New campaign** opens a six-step wizard. You can jump between steps freely — the checks that
matter are enforced at launch, not by trapping you in a step.

**1. Campaign basics** — name and timezone. Sending windows are read in that timezone.

**2. Select leads** — pick your leads and see the selection broken into what will actually be
sent to: eligible verified leads, skipped for having no email, skipped as not verified, skipped as
suppressed, and skipped as already in an active campaign.

**3. Select mailboxes** — the important step. Each mailbox shows its status and a bar of used and
reserved against its daily hard limit. Mailboxes that cannot send are not selectable. As you
select, the campaign's available capacity for today is totalled up.

**4. Email sequence** — subject and body for the first email, plus optional follow-ups with a
delay in days. Three variables are supported:

```text
{{first_name}}   {{company}}   {{job_title}}
```

Anything else in double braces is flagged as unknown — it would arrive in the recipient's inbox
as literal `{{...}}` text, so it blocks launch.

**5. Schedule and limits** — start date, sending days, sending window, delay between sends per
mailbox, and a maximum sends per day for the campaign. That maximum cannot exceed what the
selected mailboxes allow.

**6. Review and launch** — the full summary: eligible leads, selected mailboxes, capacity
available, estimated days to complete, sequence length and schedule. Every unmet check is listed
in plain language, and **Launch campaign** stays disabled until the list is empty.

### Inspecting a campaign

Opening a campaign gives five tabs:

- **Overview** — status, selections, live capacity, estimated days, schedule, and disabled pause / resume /
  stop controls. Campaign sending works, but these controls have no action wired yet.
- **Leads** — the enrolled leads.
- **Sequence** — the emails as they will be sent.
- **Mailboxes** — the campaign's mailboxes and their current headroom.
- **Activity** — every recorded event with the lead, mailbox and message it belongs to.

Before any real sending exists, the results panel says exactly that:

```text
No send events recorded yet.
No replies synced yet.
No opens recorded yet.
```

Capacity on this page is recalculated from the mailboxes as they stand right now, not from a
figure stored when the campaign was created — hard limits and usage move during the day.

---

## Inbox

One inbox for replies from every connected mailbox. Threads on the left, the selected thread on
the right.

Filter tabs: **All · Unread · Replied · Archived**.

Each thread opens with the message, then a context panel answering where it came from and what it
belongs to — receiving mailbox, linked lead, linked campaign, message id — with links through to
the campaign. A reply box sits below it. **Send reply** sends through the receiving mailbox’s Zoho SMTP
connection, records the outbound message/event, and marks the thread as replied.

Empty state:

```text
No replies synced yet. Connect Zoho mailboxes to receive replies here.
```

> **Note on filters.** The UI design spec called for Positive / Out of office / Bounce tabs. Those
> are not here, because nothing on a reply record carries a classification yet and offering the
> tabs would advertise sorting that does not happen. They arrive with reply classification.

---

## Mailboxes

Where mailboxes are connected and their limits are set. This page owns the numbers that constrain
every campaign in the app.

Each mailbox shows connection status, a bar of used and reserved against the daily hard limit,
then the full picture: daily hard limit, hourly hard limit, used today, reserved today, available
today, sending window, timezone, and whether an app password is configured.

Mailbox statuses: **Not connected · Connected · Warming · Sending paused · Error**. Only a
**Connected** mailbox contributes capacity to a campaign.

### Adding a mailbox

The form takes an email address, display name, Zoho app password, daily and hourly hard limits, a
sending window and a timezone.

**Your app password is write-only in the UI.** The API saves it encrypted with AES-256-GCM
using `WORKER_ENCRYPTION_KEY`, bound to the mailbox id. Server-side sending decrypts it;
the browser shows only `App password configured`. The form saves the mailbox and limits.
Existing mailbox limits, display name, sending window and timezone can be edited.

### Warmup

The **Warmup** tab lets you enable warmup and save daily limits, rampup, randomized daily
counts, reply rates and fresh inbound percentages. It shows stored warmup activity and today’s
target. A separate warmup worker uses Zoho mailboxes and connected Gmail seed accounts;
seed accounts are managed under **Settings → Admin**. Configured workers and seed accounts
are required for warmup activity.

---

## Settings

Everything here applies to the active workspace only — Warmailer is multi-client, and no setting
is global.

- **Workspace** — name and the workspace id used to scope every record
- **Team and roles** — members and your own role; invites are not available yet
- **Suppression** — addresses and domains that must never be contacted, with disabled editing controls on this page
- **Unsubscribe footer** — configuration placeholder; editing is disabled on this page
- **Tracking domain** — custom domain configuration placeholder; signed open-pixel tracking already exists
- **Billing** — placeholder

Workspace, team invites, suppression, unsubscribe-footer and tracking-domain editing controls
on this Settings page remain disabled. This does not mean the workspace tables or mail workers
are disconnected. **Settings → Admin** has working warmup seed-account management.

---

## The hard-limit rule

The single most important behaviour in Warmailer, and the reason several buttons stay grey.

A mailbox's headroom for today is:

```text
availableToday = dailyHardLimit − usedToday − reservedToday
```

never below zero. A campaign's capacity is the sum of that across its selected mailboxes, counting
only the ones that are actually connected:

```text
campaignDailyCapacity = sum(availableToday) for selected connected mailboxes
```

This arithmetic lives in exactly one place in the codebase. The dashboard, the campaign wizard and
the campaign detail page all read from it; none of them keep their own version, so no screen can
drift into showing a more generous number than another.

A campaign cannot launch while any of these are true:

1. No eligible leads are selected
2. No mailbox is selected
3. A selected mailbox is not connected
4. A selected mailbox is paused or in error
5. The eligible leads exceed the capacity available today
6. The campaign's daily cap exceeds that capacity
7. The sequence is empty
8. The schedule is invalid — no start date, no sending days, or a window that closes before it opens
9. The sequence contains a variable the system cannot resolve

Every failing check is listed on the review step in full sentences, so the disabled button is
never a mystery. Automated tests cover rules 2 through 6 and 9 specifically.

---

## Known gaps / placeholders

These are the remaining areas that should not be mistaken for complete production features:

| Area | State |
|---|---|
| Authentication and sign-in | Built for the current internal workspace flow; broader customer membership/onboarding is still limited. |
| Email enrichment pattern table | Migration exists in the repo. Production can fall back to deriving patterns from existing verified leads if the table is not present. |
| Warmup | Built separately from campaign sending; treat warmup operations as their own worker path. |
| Open and click tracking | Signed open-pixel tracking and estimated open-rate reporting exist. Custom tracking-domain editing is disabled; click tracking was not established by this review. |
| Campaign controls | Pause/resume/stop buttons on campaign detail remain disabled; campaign sending is implemented. |
| Settings editing | Workspace, invites, suppression, footer and tracking-domain controls remain disabled; warmup Admin is implemented. |
| Global search | The top-bar search box is disabled; the account button logs out. |

Lead import, email finding, Reoon verification, campaign sending, reply/bounce sync, mailbox
connection, and the capacity rules are live production paths.

---

## Reference

| Document | Contents |
|---|---|
| `docs/FRONTEND_CLAUDE_BUILD.md` | The build plan this frontend was written against |
| `docs/superpowers/specs/2026-08-12-warmailer-design.md` | Product behaviour |
| `docs/superpowers/specs/2026-08-12-warmailer-ui-design.md` | Visual system and screens |

Key files: capacity and launch rules in `apps/web/lib/capacity.ts`, record shapes in
`apps/web/lib/types.ts`, sidebar in `apps/web/lib/nav.ts`, seeded records in
`apps/web/lib/demo.ts`, tests in `apps/web/test/frontend-invariants.test.ts`.
