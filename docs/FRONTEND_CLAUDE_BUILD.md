# Warmailer Frontend Build Plan for Claude

## Goal

Build the full Warmailer frontend first, before backend wiring. The frontend must feel like a real outbound email platform, but it must not fake live business numbers or pretend backend work exists.

Warmailer is a multi-client outbound email app:

- leads are imported from Apollo CSV into `all_leads_mmp`
- emails are found through Apify actors
- campaigns send through connected Zoho mailboxes
- replies from all mailboxes appear in one master inbox
- mailbox hard limits must never be crossed by campaign sending
- warmup exists later, but should not be presented as a working feature yet

## Non-negotiable rules

1. Work only inside `apps/web` unless a test/doc file is directly required.
2. Do not read, print, or edit `.env.local`.
3. Do not touch HRMS code, tables, copy, or docs.
4. Do not create separate branches or worktrees.
5. Do not add a dependency unless the same result cannot be done cleanly with React, Next, CSS, or an existing dependency.
6. Do not hard-code fake SaaS performance numbers.
7. Do not create sidebar clutter.
8. Do not make real Supabase, Zoho, Apify, or external calls yet.
9. Every visible record must have metadata lineage fields ready for backend wiring.
10. Mailbox hard limits are the source of truth for campaign capacity.

Use Ponytail full mode:

```text
C:\Users\admin\.codex\plugins\cache\ponytail\ponytail\4.9.0\skills\ponytail\SKILL.md
```

Meaning: smallest correct implementation, reuse existing patterns, delete bloat, no speculative abstractions, one runnable check for non-trivial linkage logic.

## Main navigation

The sidebar must have only these 6 main items:

1. Dashboard
2. Leads
3. Campaigns
4. Inbox
5. Mailboxes
6. Settings

Do not add sidebar items for imports, enrichment, new campaign, campaign detail, team, billing, or warmup. Those are nested flows inside the main modules.

## Route map

Use routes only where the page flow needs them:

```text
/
/leads
/campaigns
/campaigns/new
/campaigns/[id]
/inbox
/mailboxes
/settings
```

Optional nested routes only if they make the UI simpler:

```text
/leads/imports
/settings/team
```

Avoid these as top-level/sidebar concepts:

```text
/enrichment
/warmup
/settings/billing
```

Enrichment belongs inside Leads. Warmup belongs as a disabled/coming-later section inside Mailboxes. Billing can stay inside Settings as a small placeholder section if needed.

## Global app layout

Create a clean SaaS shell:

- left sidebar with 6 items only
- top bar with active workspace/client, search placeholder, and user menu placeholder
- main content area with consistent page header
- responsive mobile nav
- no flashy gradients that make the product look like a template
- no giant fake KPI cards

Style direction:

- calm B2B SaaS
- dense enough for operations
- white/slate background
- blue or indigo primary action
- clear tables, filters, status badges
- readable at 1366px width

## Shared frontend data contract

Until backend is connected, use typed local records with empty/connected states. Do not use random fake numbers.

Every displayed entity must include lineage metadata:

```ts
type EntityLineage = {
  workspaceId: string;
  source: "apollo_csv" | "apify_primary" | "apify_fallback" | "zoho_mail" | "user_action" | "system";
  entityId: string;
  leadId?: string;
  campaignId?: string;
  mailboxId?: string;
  importId?: string;
  enrichmentBatchId?: string;
  messageId?: string;
  createdAt: string;
  updatedAt: string;
};
```

For frontend placeholders, use deterministic empty states such as:

- `No leads imported yet`
- `No campaign launched yet`
- `No mailbox connected yet`
- `Connect a mailbox before launching`
- `Import leads before finding emails`
- `Mailbox capacity is not enough for this campaign`

If sample rows are needed for layout, keep them obviously seeded and metadata-backed:

```ts
const demoMode = false;
```

Default must be empty/realistic state, not demo screenshots.

## Dashboard page: `/`

Purpose: one overview of the outbound system.

Show:

- lead import state
- email enrichment state
- campaign sending state
- mailbox capacity state
- inbox reply state
- warnings that block launch

Do not show fake open rate, fake revenue, fake reply count, or fake mailbox health.

Useful empty dashboard cards:

- Leads: `No leads imported`
- Mailboxes: `No mailboxes connected`
- Campaigns: `No active campaigns`
- Inbox: `No replies synced`
- Capacity: `Connect mailboxes to calculate send capacity`

Primary actions:

- Import leads
- Connect mailbox
- Create campaign

Each action should link to the correct module.

## Leads page: `/leads`

Purpose: manage all leads in `all_leads_mmp`.

Show:

- leads table
- import CSV action
- bulk select
- bulk find emails action
- enrichment status inside this page, not as separate sidebar item
- filters: company, job title, industry, location, email status

Required CSV header text:

```text
source_file,name,job_title,company,link,location,employees,industry
```

Lead statuses:

```text
not_enriched
queued
processing
email_found
not_found
failed
suppressed
```

Bulk find email behavior in UI:

- user can select all filtered leads
- existing-email leads are skipped
- only leads without email are eligible
- primary single-link actor runs first later
- fallback bulk actor only receives leads where primary returned true not-found

Frontend should show this as a clear flow, without actually calling Apify.

## Campaigns page: `/campaigns`

Purpose: list campaigns and show campaign state.

Sidebar item is only `Campaigns`.

Show:

- campaign list
- status badge: draft, scheduled, sending, paused, completed, failed
- selected leads count
- selected mailboxes count
- capacity check status
- last activity

No fake campaigns by default. Empty state:

```text
No campaigns yet. Create a campaign after importing leads and connecting mailboxes.
```

## New campaign flow: `/campaigns/new`

Purpose: create a campaign safely.

Use one page wizard or stepper. Keep it simple.

Steps:

1. Campaign basics
2. Select leads
3. Select mailboxes
4. Write email sequence
5. Schedule and limits
6. Review and launch

### Step 1: Campaign basics

Fields:

- campaign name
- workspace/client
- timezone

### Step 2: Select leads

Show:

- total selected leads
- eligible leads
- skipped leads
- reason breakdown: missing email, suppressed, already in active campaign

### Step 3: Select mailboxes

This is critical.

Mailbox records must include:

```ts
type MailboxCapacity = {
  mailboxId: string;
  emailAddress: string;
  status: "not_connected" | "connected" | "warming" | "sending_paused" | "error";
  dailyHardLimit: number;
  hourlyHardLimit: number;
  usedToday: number;
  reservedToday: number;
  availableToday: number;
  sendingWindowStart: string;
  sendingWindowEnd: string;
  timezone: string;
};
```

Campaign capacity must be calculated from selected mailboxes:

```ts
availableToday = dailyHardLimit - usedToday - reservedToday
campaignDailyCapacity = sum(availableToday for selected connected mailboxes)
```

The launch button must be disabled when:

- no mailbox is selected
- a selected mailbox is not connected
- selected leads exceed available mailbox capacity
- any selected mailbox has `sending_paused` or `error`
- sequence is empty
- schedule is invalid

Never allow campaign UI to imply it can send more than selected mailbox hard limits.

### Step 4: Email sequence

Fields:

- subject
- body
- follow-up delay
- optional follow-up subject/body

Variables:

```text
{{first_name}}
{{company}}
{{job_title}}
```

Validate unresolved variables before launch.

### Step 5: Schedule and limits

Fields:

- start date
- sending days
- sending window
- per-mailbox delay between sends
- max sends per day for this campaign

Campaign max sends per day cannot exceed selected mailbox available capacity.

### Step 6: Review and launch

Show:

- selected leads
- selected mailboxes
- available capacity
- estimated days to complete
- sequence summary
- blocked launch reasons

The review page must make the hard-limit rule obvious:

```text
This campaign can send only through selected mailboxes and cannot exceed their hard limits.
```

## Campaign detail page: `/campaigns/[id]`

Purpose: inspect and operate one campaign.

Tabs/sections:

- Overview
- Leads
- Sequence
- Mailboxes
- Activity

Show:

- campaign status
- selected lead set
- selected mailboxes
- mailbox capacity usage
- sent/delivered/open/reply/bounce placeholders
- pause/resume/stop controls

No fake metric numbers. Before backend events exist, show:

```text
No send events recorded yet.
No replies synced yet.
Open tracking not configured yet.
```

Every activity row must be traceable:

```ts
type CampaignActivity = EntityLineage & {
  eventType: "scheduled" | "sent" | "delivered" | "opened" | "replied" | "bounced" | "paused" | "resumed" | "stopped";
  occurredAt: string;
};
```

## Inbox page: `/inbox`

Purpose: master inbox for all replies from all connected Zoho mailboxes.

Show:

- thread list
- selected thread view
- reply composer placeholder
- mailbox source
- linked lead
- linked campaign
- reply status

Thread metadata:

```ts
type InboxThread = EntityLineage & {
  threadId: string;
  mailboxId: string;
  leadId?: string;
  campaignId?: string;
  fromEmail: string;
  subject: string;
  lastMessageAt: string;
  status: "unread" | "read" | "replied" | "archived";
};
```

Empty state:

```text
No replies synced yet. Connect Zoho mailboxes to receive replies here.
```

Reply action should be visually present but not send anything until backend exists.

## Mailboxes page: `/mailboxes`

Purpose: connect Zoho mailboxes and define hard limits.

Show:

- mailbox list
- add mailbox form
- connection status
- daily hard limit
- hourly hard limit
- used today
- reserved today
- available today
- sending window
- timezone
- warmup status placeholder

Hard-limit requirements:

- Mailbox hard limits live here.
- Campaign builder reads selected mailbox capacity from here.
- Campaign detail shows usage from the same mailbox capacity shape.
- Dashboard capacity card uses the same mailbox capacity shape.
- No page should define separate capacity math.

Add mailbox form:

- email address
- display name
- Zoho app password input
- daily hard limit
- hourly hard limit
- sending window
- timezone

Do not render saved app password back to the browser. After save, show only:

```text
App password configured
```

Warmup:

- show as `Coming later`
- do not build warmup engine UI yet
- do not show fake warmup score

## Settings page: `/settings`

Purpose: workspace/client configuration.

Sections:

- workspace/client name
- team members
- roles
- suppression settings
- unsubscribe footer placeholder
- tracking domain placeholder
- billing placeholder

Multi-client rule:

- every page must show active workspace/client context
- every future mutation must be scoped to `workspaceId`
- frontend must not assume single tenant

## Metadata, backtracking, and forward tracking

Every major UI component should be wired around one source record shape, not disconnected props.

Required rule:

```text
If a visible item appears on a page, it must be possible to answer:
where did this come from, which workspace owns it, which lead/campaign/mailbox/message does it belong to, and which page/action consumes it next?
```

Minimum metadata fields:

- `workspaceId`
- `source`
- `entityId`
- `createdAt`
- `updatedAt`
- related IDs: `leadId`, `campaignId`, `mailboxId`, `importId`, `messageId`

Backtracking examples:

- Inbox reply -> messageId -> mailboxId -> leadId -> campaignId
- Campaign send event -> campaignId -> leadId -> mailboxId
- Lead email -> leadId -> enrichmentBatchId -> Apify actor source

Forward tracking examples:

- Imported lead -> enrichment eligibility -> campaign eligibility
- Connected mailbox -> campaign capacity -> send schedule
- Reply thread -> inbox -> campaign detail activity

## Performance rule

Avoid the old owner-page lag pattern.

Do not repeat remote auth/profile/workspace checks separately in middleware, layout, and page.

Frontend build should not add remote calls yet. When backend wiring starts later:

- resolve workspace once server-side
- pass needed data down
- avoid duplicate `auth.getUser()` chains per route
- page components should consume already-scoped data

## Tests Claude must add

Add small tests only for real invariants.

Required checks:

1. Sidebar has exactly 6 main items.
2. Campaign launch is blocked when selected leads exceed mailbox capacity.
3. Campaign launch is blocked when a selected mailbox is paused/error/not connected.
4. App password value is never rendered after mailbox save state.
5. Visible sample/entity records include lineage metadata.
6. No top-level sidebar items for imports, enrichment, warmup, billing, or campaign detail.

Do not create huge test suites. One focused test file is enough if it covers these invariants.

## Done definition

Frontend is done when:

- all main pages render
- sidebar has only 6 items
- campaign flow is complete
- mailbox hard-limit capacity is enforced in UI
- leads import/enrichment flow is represented inside Leads
- master inbox flow is represented
- settings covers workspace/team/suppression/tracking placeholders
- no fake live metrics are shown
- no external calls are made
- tests pass
- typecheck passes
- build passes

Commands:

```powershell
npm.cmd --workspace @warmailer/web test
npm.cmd --workspace @warmailer/web run typecheck
npm.cmd --workspace @warmailer/web run build
```

## Ponytail audit before handoff

Before saying done, remove:

- unused components
- duplicate page shells
- unused route pages
- fake metric fixture data
- dependencies that are not needed
- separate capacity math outside the mailbox/campaign capacity source

Keep:

- validation at trust boundaries
- accessibility basics
- metadata lineage
- capacity blocking logic
- clear empty states

Verdict target: `SAFE` — frontend has correct page flow and the mailbox hard-limit source of truth is not duplicated.
