# Warmailer — User Manual

What the app is, what every screen does, and — just as importantly — what it does not do yet.

**Status: frontend only.** Every screen is built and navigable, but nothing is connected to a
backend. No email is sent, no lead is imported, no mailbox is connected, no setting is saved.
Buttons that would cause one of those things are visible but disabled, and each says why. This is
deliberate: the interface was built first so the flow could be checked before any real send
could happen.

---

## What Warmailer is for

Warmailer runs cold outbound email for several client workspaces at once:

1. Leads are imported from an Apollo CSV export.
2. Missing email addresses are found through enrichment actors.
3. Campaigns send through connected Zoho mailboxes.
4. Replies from every mailbox land in one shared inbox.
5. A mailbox's hard limits cap what any campaign can send through it.

Point 5 is the rule the whole interface is built around. It is covered in its own section below.

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

Every screen defaults to its empty state, because inventing traffic numbers would make the app
lie about a workspace that has not sent anything. To view the populated layouts, open
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

The top bar carries the active workspace, a search box, a theme toggle and an account button.
Search and the account menu are placeholders in this build.

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

Four cards across the top show **Leads**, **Mailboxes**, **Campaigns** and **Inbox** — each either
a count or a plain empty state (`No leads imported`, `No mailboxes connected`, `No active
campaigns`, `No replies synced`), with a link into that module.

Below them:

- **Send capacity today** — the total sends available right now, with a bar per mailbox showing
  how much of its daily hard limit is already used or reserved. With no mailboxes connected it
  reads `Connect mailboxes to calculate send capacity`.
- **Blocking a launch** — the concrete reasons you cannot start sending yet, such as
  `Import leads before finding emails` or `Connect a mailbox before launching`.
- **Sending activity** — send counts once campaigns run.

You will not find an open rate, a reply rate or a deliverability score anywhere on this page. Open
tracking is not configured, so no such number exists to show.

Three buttons in the header jump to the things you would actually do next: **Import leads**,
**Connect mailbox**, **Create campaign**.

---

## Leads

Manages every lead in the workspace, and the enrichment that finds their email addresses.

### Importing

The importer expects an Apollo CSV export with exactly this header row:

```text
source_file,name,job_title,company,link,location,employees,industry
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

**Find emails** acts only on the eligible group. The stated order of work: the primary
single-link actor runs first for each lead, and only leads it reports as a genuine not-found are
passed to the fallback bulk actor. Results write back with the enrichment batch that produced
them, so any address can be traced to its source.

Nothing is called yet — no actor runs from this build.

### Lead statuses

| Status | Meaning |
|---|---|
| Not enriched | No enrichment attempted |
| Queued | Waiting for an enrichment run |
| Processing | Enrichment in progress |
| Email found | Address found and stored |
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
sent to: eligible, skipped for having no email, skipped as suppressed, and skipped as already in
an active campaign.

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

- **Overview** — status, selections, live capacity, estimated days, schedule, and pause / resume /
  stop controls.
- **Leads** — the enrolled leads.
- **Sequence** — the emails as they will be sent.
- **Mailboxes** — the campaign's mailboxes and their current headroom.
- **Activity** — every recorded event with the lead, mailbox and message it belongs to.

Before any real sending exists, the results panel says exactly that:

```text
No send events recorded yet.
No replies synced yet.
Open tracking not configured yet.
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
the campaign. A reply box sits below it, disabled, noting that replies are not wired to Zoho yet.

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

**Your app password is write-only.** The mailbox record has no field to hold it, so it can never
be read back into the browser — a saved mailbox shows only `App password configured`. In this
build the form saves nothing at all, and the value you typed is discarded the moment you submit.

### Warmup

Marked **Coming later**. Warmup will raise a new mailbox's volume gradually before campaigns lean
on it. The engine is not built, and no warmup score is shown, because nothing is measuring one.

---

## Settings

Everything here applies to the active workspace only — Warmailer is multi-client, and no setting
is global.

- **Workspace** — name and the workspace id used to scope every record
- **Team and roles** — members and your own role; invites are not available yet
- **Suppression** — addresses and domains that must never be contacted, plus auto-suppression on
  an unsubscribe request
- **Unsubscribe footer** — appended to every campaign email, kept out of the sequence editor so a
  campaign cannot drop it
- **Tracking domain** — a domain you own, for link and open tracking once tracking exists
- **Billing** — placeholder

All controls are disabled until the workspace tables are connected.

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

## What is not built

So that nothing here is mistaken for working:

| Area | State |
|---|---|
| Supabase, Zoho, Apify connections | None. No external call is made anywhere. |
| Authentication and sign-in | Not built. The frontend uses `MyMaidsPro` as the active workspace until Supabase membership is wired. |
| CSV import | Interface only; no file is parsed or stored. |
| Email enrichment | Interface only; no actor runs. |
| Campaign sending | Interface only; launch, pause, resume and stop do nothing. |
| Reply sync and replying | Interface only; the composer is disabled. |
| Mailbox connection | Interface only; the add form saves nothing. |
| Settings | Interface only; every control is disabled. |
| Warmup | Not built, shown as Coming later. |
| Open and click tracking | Not configured, which is why no open rate appears. |
| Global search, account menu | Placeholders in the top bar. |

Screen layouts, navigation, empty states, the capacity rules and the launch-blocking logic are
real and tested. Everything that would touch the outside world is not.

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
