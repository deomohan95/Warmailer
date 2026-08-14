# Warmup System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Warmailer warmup system that sends low-volume real emails from connected sender mailboxes to Gmail seed accounts, checks inbox versus spam placement, rescues spam placements, generates natural replies, and shows Smartlead-style reputation metrics.

**Architecture:** Existing Zoho mailboxes remain the sender source of truth. Gmail seed accounts are connected through Composio and stored as warmup seed rows. A cron route calls a worker cycle that schedules warmup messages, sends through the existing SMTP path, checks Gmail placement through Composio, performs Gmail-side actions, records append-only events, and exposes derived dashboard metrics.

**Tech Stack:** Node.js >=22, Next.js App Router, Supabase Postgres/RLS/Data API, existing `fetch` REST helpers, Nodemailer for sender SMTP, Composio Gmail toolkit for seed Gmail actions, Vitest/node:test/static SQL tests.

## Global Constraints

- Do not expose Supabase service-role keys, Composio API keys, Gmail tokens, Zoho app passwords, or encrypted mailbox secrets to browser code.
- Keep campaign sending and warmup sending separated at the data layer; campaign `messages` remain for prospect/campaign history only.
- Every warmup row must carry `workspace_id` and tenant-safe foreign keys.
- Browser routes derive `workspace_id` from authenticated membership; never trust browser-supplied `workspace_id`.
- A Gmail seed account may be added one at a time; the schema must work for one seed today and ten seeds without another migration.
- Warmup reputation is derived from recorded events, not manually edited counters.
- First build supports Zoho sender mailboxes to Gmail seed accounts. Gmail as a customer sender mailbox is a separate feature.
- This warms the sender mailbox/domain path you control. Dedicated-IP pool management is out of scope unless the mail provider exposes a dedicated IP assignment API.
- No AI-generated prospecting copy is needed for MVP; use a small rotating set of generic human office emails with per-message token markers.

---

## Current Repo Findings

- `docs/USER_MANUAL.md` still says warmup is not built.
- `apps/web/components/mailboxes/mailboxes-workspace.tsx` has a disabled Warmup card.
- `supabase/migrations/20260812095925_add_mailboxes.sql` already has mailbox status `warming`, `mailbox_daily_usage`, `mailbox_events`, and `mailbox_capacity`.
- `apps/web/app/api/cron/send/route.ts` already shows the pattern for a protected cron route calling worker code.
- `apps/worker/src/mail-worker.mjs` already loads `.env.local`, decrypts mailbox app passwords, sends through SMTP, and syncs IMAP replies.
- `apps/worker/src/inbox-sync.mjs` only syncs campaign replies that reference tracked outbound messages, so warmup needs its own tables and sync path.
- `.env.local` currently contains `Composio_api_key` but not normalized `COMPOSIO_API_KEY`, `COMPOSIO_GMAIL_USER_ID`, or seed connected-account IDs.
- `@composio/core` is not installed in either workspace package today.

## External API Facts Checked

- Composio Gmail toolkit current page lists Gmail actions including `GMAIL_SEND_EMAIL`, `GMAIL_FETCH_EMAILS`, `GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID`, `GMAIL_REPLY_TO_THREAD`, `GMAIL_ADD_LABEL_TO_EMAIL`, and `GMAIL_BATCH_MODIFY_MESSAGES`: https://docs.composio.dev/toolkits/gmail
- Composio direct tool execution uses scoped users and supports direct `tools.execute`, with toolkit versioning required for deterministic parsed outputs: https://docs.composio.dev/docs/tools-direct/executing-tools
- Composio Tools API also supports HTTP execution via `POST /api/v3.1/tools/execute/{tool_slug}` with `x-api-key`: https://docs.composio.dev/reference/api-reference/tools
- Gmail labels include system labels such as `INBOX` and `SPAM`, and Gmail API docs say some system labels can be applied or removed: https://developers.google.com/workspace/gmail/api/guides
- Gmail scope guidance says `gmail.modify` allows read, compose, and send without the full destructive `https://mail.google.com/` scope: https://developers.google.com/workspace/gmail/api/auth/scopes

---

## File Structure

### Create

- `docs/superpowers/plans/2026-08-14-warmup-system-plan.md`
  - This plan.
- `supabase/migrations/<generated>_add_warmup.sql`
  - Warmup tables, enums, derived views, RLS policies, grants, and claim RPC.
- `supabase/tests/warmup-static.test.mjs`
  - Static SQL invariants for workspace ownership, RLS, derived score, and service-owned writes.
- `apps/worker/src/warmup-worker.mjs`
  - Main warmup cycle: schedule, send, placement check, spam rescue, important marker, reply, stats.
- `apps/worker/src/composio-gmail.mjs`
  - Minimal Composio Gmail adapter using `fetch` and `COMPOSIO_API_KEY`.
- `apps/worker/test/warmup-worker.test.mjs`
  - Unit tests with fake DB, fake SMTP, and fake Gmail adapter.
- `apps/web/app/api/cron/warmup/route.ts`
  - Protected cron endpoint that calls `runWarmupCycle`.
- `apps/web/app/api/warmup/mailboxes/route.ts`
  - Toggle and configure warmup on existing sender mailboxes.
- `apps/web/app/api/warmup/seeds/route.ts`
  - Register/list Gmail seed accounts already connected in Composio.
- `apps/web/lib/warmup-data.ts`
  - Server-side warmup data loading and row mapping.

### Modify

- `vercel.json`
  - Add `/api/cron/warmup` schedule.
- `.env.example`
  - Add normalized Composio env names without values.
- `apps/worker/package.json`
  - Add `warmup` script; do not add Composio SDK unless direct `fetch` proves insufficient.
- `apps/web/lib/types.ts`
  - Add warmup types used by UI.
- `packages/contracts/src/index.ts`
  - Add Zod schemas for warmup API inputs.
- `apps/web/app/(app)/mailboxes/page.tsx`
  - Load warmup data alongside existing mailboxes.
- `apps/web/components/mailboxes/mailboxes-workspace.tsx`
  - Replace disabled Warmup card with per-mailbox warmup controls and summary.
- `apps/web/app/styles/pages.css`
  - Add compact dashboard styles for warmup metrics.
- `apps/web/test/frontend-invariants.test.ts`
  - Add frontend wiring invariants for warmup controls and API routes.

---

## Data Model

### Mailbox Warmup Columns

Add warmup configuration onto the existing `mailboxes` table because the sender mailbox is the source of truth.

```sql
alter table public.mailboxes
  add column if not exists warmup_enabled boolean not null default false,
  add column if not exists warmup_daily_limit integer not null default 25 check (warmup_daily_limit between 1 and 100),
  add column if not exists warmup_daily_rampup integer not null default 5 check (warmup_daily_rampup between 1 and 100),
  add column if not exists warmup_randomize_daily_count boolean not null default true,
  add column if not exists warmup_reply_rate_percent integer not null default 20 check (warmup_reply_rate_percent between 0 and 100),
  add column if not exists warmup_started_at timestamptz;
```

### Seed Accounts

```sql
do $$
begin
  create type public.warmup_seed_status as enum ('connected', 'disabled', 'error');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.warmup_seed_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'gmail' check (provider = 'gmail'),
  email_address text not null,
  composio_user_id text not null,
  composio_connected_account_id text not null,
  status public.warmup_seed_status not null default 'connected',
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, lower(email_address)),
  unique (workspace_id, composio_connected_account_id)
);
```

### Warmup Messages And Events

```sql
do $$
begin
  create type public.warmup_message_status as enum ('scheduled', 'claimed', 'sent', 'landed_inbox', 'saved_from_spam', 'replied', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.warmup_event_type as enum ('scheduled', 'claimed', 'sent', 'landed_inbox', 'landed_spam', 'saved_from_spam', 'marked_important', 'reply_sent', 'failed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.warmup_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  mailbox_id uuid not null,
  seed_account_id uuid not null,
  direction text not null default 'mailbox_to_seed' check (direction = 'mailbox_to_seed'),
  token text not null,
  subject text not null,
  body_text text not null,
  status public.warmup_message_status not null default 'scheduled',
  scheduled_for timestamptz not null,
  claimed_at timestamptz,
  sent_at timestamptz,
  sender_provider_message_id text,
  seed_provider_message_id text,
  seed_thread_id text,
  landed_folder text check (landed_folder in ('inbox', 'spam')),
  rescued_at timestamptz,
  marked_important_at timestamptz,
  replied_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, token),
  foreign key (mailbox_id, workspace_id) references public.mailboxes(id, workspace_id) on delete cascade,
  foreign key (seed_account_id, workspace_id) references public.warmup_seed_accounts(id, workspace_id) on delete restrict
);

create index if not exists warmup_messages_due_idx
  on public.warmup_messages (status, scheduled_for);

create index if not exists warmup_messages_workspace_mailbox_idx
  on public.warmup_messages (workspace_id, mailbox_id, created_at desc);

create table if not exists public.warmup_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  warmup_message_id uuid not null,
  mailbox_id uuid not null,
  seed_account_id uuid not null,
  event_type public.warmup_event_type not null,
  source text not null check (source in ('system', 'zoho_mail', 'gmail_composio')),
  provider_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (warmup_message_id) references public.warmup_messages(id) on delete cascade,
  foreign key (mailbox_id, workspace_id) references public.mailboxes(id, workspace_id) on delete cascade,
  foreign key (seed_account_id, workspace_id) references public.warmup_seed_accounts(id, workspace_id) on delete restrict
);

create unique index if not exists warmup_events_provider_uidx
  on public.warmup_events (workspace_id, provider_event_id)
  where provider_event_id is not null;
```

### Claim Function

Use one public RPC callable only by `service_role` so overlapping cron runs do not send the same warmup message twice.

```sql
create or replace function public.claim_warmup_messages(p_limit integer)
returns setof public.warmup_messages
language sql
security invoker
as $$
  update public.warmup_messages wm
  set status = 'claimed',
      claimed_at = now(),
      updated_at = now()
  where wm.id in (
    select id
    from public.warmup_messages
    where status = 'scheduled'
      and scheduled_for <= now()
    order by scheduled_for asc
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning wm.*;
$$;

revoke all on function public.claim_warmup_messages(integer) from public;
revoke all on function public.claim_warmup_messages(integer) from anon;
revoke all on function public.claim_warmup_messages(integer) from authenticated;
grant execute on function public.claim_warmup_messages(integer) to service_role;
```

### Derived Views

```sql
create or replace view public.warmup_mailbox_stats
with (security_invoker = true)
as
select
  m.workspace_id,
  m.id as mailbox_id,
  m.email_address,
  m.warmup_enabled,
  m.warmup_daily_limit,
  m.warmup_daily_rampup,
  m.warmup_randomize_daily_count,
  m.warmup_reply_rate_percent,
  m.warmup_started_at,
  count(wm.id) filter (where wm.sent_at >= now() - interval '7 days')::integer as sent_7d,
  count(wm.id) filter (where wm.landed_folder = 'inbox' and wm.sent_at >= now() - interval '7 days')::integer as inbox_7d,
  count(wm.id) filter (where wm.landed_folder = 'spam' and wm.sent_at >= now() - interval '7 days')::integer as spam_7d,
  count(wm.id) filter (where wm.rescued_at is not null and wm.sent_at >= now() - interval '7 days')::integer as saved_from_spam_7d,
  count(wm.id) filter (where wm.replied_at is not null and wm.sent_at >= now() - interval '7 days')::integer as replied_7d,
  case
    when count(wm.id) filter (where wm.landed_folder in ('inbox', 'spam') and wm.sent_at >= now() - interval '7 days') = 0 then 100
    else round(
      100.0 * count(wm.id) filter (where wm.landed_folder = 'inbox' and wm.sent_at >= now() - interval '7 days')
      / count(wm.id) filter (where wm.landed_folder in ('inbox', 'spam') and wm.sent_at >= now() - interval '7 days')
    )::integer
  end as reputation
from public.mailboxes m
left join public.warmup_messages wm on wm.workspace_id = m.workspace_id and wm.mailbox_id = m.id
group by m.workspace_id, m.id;
```

---

## Task 1: Schema And RLS

**Files:**
- Create: `supabase/migrations/<generated>_add_warmup.sql`
- Create: `supabase/tests/warmup-static.test.mjs`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Produces table `public.warmup_seed_accounts`.
- Produces table `public.warmup_messages`.
- Produces table `public.warmup_events`.
- Produces view `public.warmup_mailbox_stats`.
- Produces RPC `public.claim_warmup_messages(p_limit integer)`.

- [ ] **Step 1: Generate the migration file**

Run:

```powershell
supabase migration new add_warmup
```

- [ ] **Step 2: Write failing static SQL tests**

Add `supabase/tests/warmup-static.test.mjs`:

```js
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const migrationName = readdirSync(new URL("../migrations", import.meta.url)).find((name) => name.includes("add_warmup"));
assert.ok(migrationName, "expected an add_warmup migration");
const migration = readFileSync(new URL(`../migrations/${migrationName}`, import.meta.url), "utf8");

test("warmup rows are workspace-owned and linked to sender and seed accounts", () => {
  for (const table of ["warmup_seed_accounts", "warmup_messages", "warmup_events"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /foreign key \(mailbox_id, workspace_id\) references public\.mailboxes\(id, workspace_id\)/i);
  assert.match(migration, /foreign key \(seed_account_id, workspace_id\) references public\.warmup_seed_accounts\(id, workspace_id\)/i);
});

test("warmup reputation is derived from events and messages", () => {
  assert.match(migration, /create or replace view public\.warmup_mailbox_stats/i);
  assert.match(migration, /with \(security_invoker = true\)/i);
  assert.match(migration, /saved_from_spam_7d/i);
  assert.match(migration, /reputation/i);
});

test("browser roles cannot write worker-owned warmup message rows", () => {
  assert.match(migration, /grant select on public\.warmup_messages to authenticated;/i);
  assert.doesNotMatch(migration, /grant select, insert, update on public\.warmup_messages to authenticated;/i);
  assert.doesNotMatch(migration, /security definer/i);
});

test("warmup claims are service-role only and row-locked", () => {
  assert.match(migration, /create or replace function public\.claim_warmup_messages/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /grant execute on function public\.claim_warmup_messages\(integer\) to service_role/i);
  assert.match(migration, /revoke all on function public\.claim_warmup_messages\(integer\) from authenticated/i);
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run:

```powershell
npm.cmd test --workspace @warmailer/worker -- --test-reporter spec
node --test supabase/tests/warmup-static.test.mjs
```

Expected: `warmup-static.test.mjs` fails because the migration does not exist yet.

- [ ] **Step 4: Add the migration SQL**

Use the data model SQL above. Include RLS:

```sql
alter table public.warmup_seed_accounts enable row level security;
alter table public.warmup_messages enable row level security;
alter table public.warmup_events enable row level security;

grant select, insert, update on public.warmup_seed_accounts to authenticated;
grant select on public.warmup_messages to authenticated;
grant select on public.warmup_events to authenticated;
grant select on public.warmup_mailbox_stats to authenticated;

create policy "members can view warmup seeds"
on public.warmup_seed_accounts for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "admins can manage warmup seeds"
on public.warmup_seed_accounts for all
to authenticated
using (private.workspace_role_for(workspace_id) in ('owner', 'admin'))
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

create policy "members can view warmup messages"
on public.warmup_messages for select
to authenticated
using (private.is_workspace_member(workspace_id));

create policy "members can view warmup events"
on public.warmup_events for select
to authenticated
using (private.is_workspace_member(workspace_id));
```

- [ ] **Step 5: Add contracts**

Add to `packages/contracts/src/index.ts`:

```ts
export const WarmupMailboxUpdateInputSchema = z
  .object({
    mailboxId: z.string().min(1),
    warmupEnabled: z.boolean(),
    warmupDailyLimit: z.number().int().min(1).max(100),
    warmupDailyRampup: z.number().int().min(1).max(100),
    warmupRandomizeDailyCount: z.boolean(),
    warmupReplyRatePercent: z.number().int().min(0).max(100),
  })
  .strict();

export const WarmupSeedCreateInputSchema = z
  .object({
    emailAddress: z.string().trim().email().transform((value) => value.toLowerCase()),
    composioUserId: z.string().trim().min(1),
    composioConnectedAccountId: z.string().trim().min(1),
  })
  .strict();

export type WarmupMailboxUpdateInput = z.infer<typeof WarmupMailboxUpdateInputSchema>;
export type WarmupSeedCreateInput = z.infer<typeof WarmupSeedCreateInputSchema>;
```

- [ ] **Step 6: Verify**

Run:

```powershell
node --test supabase/tests/warmup-static.test.mjs
npm.cmd test --workspace @warmailer/contracts
```

Expected: both pass.

---

## Task 2: Warmup Data Loading

**Files:**
- Create: `apps/web/lib/warmup-data.ts`
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/app/(app)/mailboxes/page.tsx`
- Modify: `apps/web/test/frontend-invariants.test.ts`

**Interfaces:**
- Produces `getWarmupMailboxStats(workspaceId: string): Promise<WarmupMailboxStats[]>`.
- Produces `getWarmupSeeds(workspaceId: string): Promise<WarmupSeedAccount[]>`.
- Mailboxes page passes `warmupStats` and `warmupSeeds` to `MailboxesWorkspace`.

- [ ] **Step 1: Add types**

Add to `apps/web/lib/types.ts`:

```ts
export type WarmupMailboxStats = EntityLineage & {
  mailboxId: string;
  emailAddress: string;
  warmupEnabled: boolean;
  warmupDailyLimit: number;
  warmupDailyRampup: number;
  warmupRandomizeDailyCount: boolean;
  warmupReplyRatePercent: number;
  warmupStartedAt?: string;
  sent7d: number;
  inbox7d: number;
  spam7d: number;
  savedFromSpam7d: number;
  replied7d: number;
  reputation: number;
};

export type WarmupSeedAccount = EntityLineage & {
  seedAccountId: string;
  provider: "gmail";
  emailAddress: string;
  status: "connected" | "disabled" | "error";
  lastCheckedAt?: string;
};
```

- [ ] **Step 2: Add failing frontend invariant**

Append:

```ts
describe("warmup wiring", () => {
  it("loads warmup stats and seeds from backend data, not demo state", async () => {
    const page = await source("app/(app)/mailboxes/page.tsx");
    const data = await source("lib/warmup-data.ts");

    expect(page).toContain("getWarmupMailboxStats");
    expect(page).toContain("getWarmupSeeds");
    expect(data).toContain("warmup_mailbox_stats");
    expect(data).toContain("warmup_seed_accounts");
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run:

```powershell
npm.cmd test --workspace @warmailer/web -- frontend-invariants.test.ts
```

Expected: FAIL because `warmup-data.ts` does not exist and the page is not wired.

- [ ] **Step 4: Add `warmup-data.ts`**

```ts
import { envValue } from "./backend-data";
import type { WarmupMailboxStats, WarmupSeedAccount } from "./types";

type WarmupStatsRow = {
  workspace_id: string;
  mailbox_id: string;
  email_address: string;
  warmup_enabled: boolean;
  warmup_daily_limit: number;
  warmup_daily_rampup: number;
  warmup_randomize_daily_count: boolean;
  warmup_reply_rate_percent: number;
  warmup_started_at: string | null;
  sent_7d: number;
  inbox_7d: number;
  spam_7d: number;
  saved_from_spam_7d: number;
  replied_7d: number;
  reputation: number;
};

type WarmupSeedRow = {
  id: string;
  workspace_id: string;
  provider: "gmail";
  email_address: string;
  status: "connected" | "disabled" | "error";
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
};

async function rest<T>(path: string): Promise<T> {
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL")?.replace(/\/$/, "");
  const key = envValue("SUPABASE_SERVICE_ROLE_KEY") ?? envValue("SUPABASE_SECRET_KEY") ?? envValue("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !key) return [] as T;
  const response = await fetch(`${url}/rest/v1/${path}`, {
    cache: "no-store",
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  if (!response.ok) return [] as T;
  return (await response.json()) as T;
}

export function mapWarmupStatsRow(row: WarmupStatsRow): WarmupMailboxStats {
  return {
    workspaceId: row.workspace_id,
    source: "system",
    entityId: row.mailbox_id,
    mailboxId: row.mailbox_id,
    emailAddress: row.email_address,
    warmupEnabled: row.warmup_enabled,
    warmupDailyLimit: row.warmup_daily_limit,
    warmupDailyRampup: row.warmup_daily_rampup,
    warmupRandomizeDailyCount: row.warmup_randomize_daily_count,
    warmupReplyRatePercent: row.warmup_reply_rate_percent,
    warmupStartedAt: row.warmup_started_at ?? undefined,
    sent7d: row.sent_7d,
    inbox7d: row.inbox_7d,
    spam7d: row.spam_7d,
    savedFromSpam7d: row.saved_from_spam_7d,
    replied7d: row.replied_7d,
    reputation: row.reputation,
    createdAt: row.warmup_started_at ?? new Date(0).toISOString(),
    updatedAt: row.warmup_started_at ?? new Date(0).toISOString(),
  };
}

export function mapWarmupSeedRow(row: WarmupSeedRow): WarmupSeedAccount {
  return {
    workspaceId: row.workspace_id,
    source: "user_action",
    entityId: row.id,
    seedAccountId: row.id,
    provider: row.provider,
    emailAddress: row.email_address,
    status: row.status,
    lastCheckedAt: row.last_checked_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getWarmupMailboxStats(workspaceId: string) {
  const rows = await rest<WarmupStatsRow[]>(`warmup_mailbox_stats?workspace_id=eq.${workspaceId}&select=*&order=email_address.asc`);
  return rows.map(mapWarmupStatsRow);
}

export async function getWarmupSeeds(workspaceId: string) {
  const rows = await rest<WarmupSeedRow[]>(`warmup_seed_accounts?workspace_id=eq.${workspaceId}&select=*&order=created_at.desc`);
  return rows.map(mapWarmupSeedRow);
}
```

- [ ] **Step 5: Wire the page**

Modify `apps/web/app/(app)/mailboxes/page.tsx` so it loads:

```ts
const [mailboxes, warmupStats, warmupSeeds] = await Promise.all([
  getMailboxes(workspace.workspaceId),
  getWarmupMailboxStats(workspace.workspaceId),
  getWarmupSeeds(workspace.workspaceId),
]);
```

Pass all three into `MailboxesWorkspace`.

- [ ] **Step 6: Verify**

Run:

```powershell
npm.cmd test --workspace @warmailer/web -- frontend-invariants.test.ts
npm.cmd run typecheck --workspace @warmailer/web
```

Expected: pass.

---

## Task 3: Warmup API Routes

**Files:**
- Create: `apps/web/app/api/warmup/mailboxes/route.ts`
- Create: `apps/web/app/api/warmup/seeds/route.ts`
- Modify: `apps/web/test/frontend-invariants.test.ts`

**Interfaces:**
- Consumes `WarmupMailboxUpdateInputSchema`.
- Consumes `WarmupSeedCreateInputSchema`.
- Produces `PATCH /api/warmup/mailboxes`.
- Produces `POST /api/warmup/seeds`.
- Produces `GET /api/warmup/seeds`.

- [ ] **Step 1: Add failing route invariant**

```ts
it("routes warmup mailbox toggles and seed registration through backend APIs", async () => {
  const component = await source("components/mailboxes/mailboxes-workspace.tsx");
  const mailboxRoute = await source("app/api/warmup/mailboxes/route.ts");
  const seedRoute = await source("app/api/warmup/seeds/route.ts");

  expect(component).toContain('fetch("/api/warmup/mailboxes"');
  expect(component).toContain('fetch("/api/warmup/seeds"');
  expect(mailboxRoute).toContain("WarmupMailboxUpdateInputSchema");
  expect(seedRoute).toContain("WarmupSeedCreateInputSchema");
  expect(seedRoute).not.toMatch(/Composio_api_key/);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```powershell
npm.cmd test --workspace @warmailer/web -- frontend-invariants.test.ts
```

- [ ] **Step 3: Add mailbox toggle route**

Route behavior:

```ts
PATCH /api/warmup/mailboxes
body: {
  mailboxId: string;
  warmupEnabled: boolean;
  warmupDailyLimit: number;
  warmupDailyRampup: number;
  warmupRandomizeDailyCount: boolean;
  warmupReplyRatePercent: number;
}
response: { ok: true }
```

Implementation pattern:

```ts
const input = WarmupMailboxUpdateInputSchema.parse(await request.json());
const workspace = await getActiveWorkspace();
await supabasePatch(
  `mailboxes?id=eq.${encodeURIComponent(input.mailboxId)}&workspace_id=eq.${encodeURIComponent(workspace.workspaceId)}`,
  {
    warmup_enabled: input.warmupEnabled,
    warmup_daily_limit: input.warmupDailyLimit,
    warmup_daily_rampup: input.warmupDailyRampup,
    warmup_randomize_daily_count: input.warmupRandomizeDailyCount,
    warmup_reply_rate_percent: input.warmupReplyRatePercent,
    warmup_started_at: input.warmupEnabled ? new Date().toISOString() : null,
    status: input.warmupEnabled ? "warming" : "connected",
    updated_at: new Date().toISOString(),
  },
);
```

Also insert `mailbox_events` row with:

```ts
{
  event_type: input.warmupEnabled ? "resumed" : "paused",
  source: "user_action",
  metadata: {
    warmupDailyLimit: input.warmupDailyLimit,
    warmupDailyRampup: input.warmupDailyRampup,
    warmupRandomizeDailyCount: input.warmupRandomizeDailyCount,
    warmupReplyRatePercent: input.warmupReplyRatePercent
  }
}
```

- [ ] **Step 4: Add seed registration route**

Route behavior:

```ts
GET /api/warmup/seeds -> { seeds: WarmupSeedAccount[] }
POST /api/warmup/seeds
body: {
  emailAddress: string;
  composioUserId: string;
  composioConnectedAccountId: string;
}
response: { seedAccountId: string }
```

Use `getActiveWorkspace()`, `WarmupSeedCreateInputSchema`, and `supabasePost("warmup_seed_accounts", ...)`.

- [ ] **Step 5: Normalize env naming**

Add to `.env.example`:

```dotenv
COMPOSIO_API_KEY=
COMPOSIO_GMAIL_TOOLKIT_VERSION=20260721_00
```

Keep runtime lookup compatible with the current local env key:

```ts
const key = envValue("COMPOSIO_API_KEY") ?? envValue("Composio_api_key");
```

- [ ] **Step 6: Verify**

Run:

```powershell
npm.cmd test --workspace @warmailer/web -- frontend-invariants.test.ts
npm.cmd run typecheck --workspace @warmailer/web
```

Expected: pass.

---

## Task 4: Composio Gmail Adapter

**Files:**
- Create: `apps/worker/src/composio-gmail.mjs`
- Create: `apps/worker/test/warmup-worker.test.mjs`
- Modify: `apps/worker/package.json`

**Interfaces:**
- Produces `createComposioGmail({ apiKey, toolkitVersion, fetchImpl })`.
- Produces methods:
  - `findWarmupMessage({ userId, connectedAccountId, token })`
  - `moveFromSpamToInbox({ userId, connectedAccountId, messageId })`
  - `markImportant({ userId, connectedAccountId, messageId })`
  - `replyToThread({ userId, connectedAccountId, threadId, body })`

- [ ] **Step 1: Write failing adapter tests**

```js
import assert from "node:assert/strict";
import test from "node:test";

import { createComposioGmail } from "../src/composio-gmail.mjs";

test("uses normalized composio api key and executes gmail search by token", async () => {
  const calls = [];
  const gmail = createComposioGmail({
    apiKey: "secret",
    toolkitVersion: "20260721_00",
    fetchImpl: async (url, init) => {
      calls.push([url, init]);
      return Response.json({ data: { messages: [{ id: "gmail-1", threadId: "thread-1", labelIds: ["SPAM"] }] } });
    },
  });

  const message = await gmail.findWarmupMessage({
    userId: "seed-user",
    connectedAccountId: "ca_seed",
    token: "wm-abc",
  });

  assert.equal(message.id, "gmail-1");
  assert.equal(message.folder, "spam");
  assert.equal(calls[0][1].headers["x-api-key"], "secret");
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```powershell
npm.cmd test --workspace @warmailer/worker -- warmup-worker.test.mjs
```

- [ ] **Step 3: Implement minimal HTTP adapter**

Use `fetch`, not a new dependency:

```js
export function createComposioGmail({ apiKey, toolkitVersion = "20260721_00", fetchImpl = fetch }) {
  if (!apiKey) throw new Error("Missing COMPOSIO_API_KEY");

  async function execute(slug, { userId, connectedAccountId, arguments: args }) {
    const response = await fetchImpl(`https://backend.composio.dev/api/v3.1/tools/execute/${slug}`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        connected_account_id: connectedAccountId,
        arguments: args,
        toolkit_versions: { gmail: toolkitVersion },
      }),
    });
    if (!response.ok) throw new Error(`Composio ${slug} failed: ${response.status} ${await response.text()}`);
    return response.json();
  }

  return {
    async findWarmupMessage({ userId, connectedAccountId, token }) {
      const result = await execute("GMAIL_FETCH_EMAILS", {
        userId,
        connectedAccountId,
        arguments: { query: `"${token}" newer_than:7d`, max_results: 10 },
      });
      const message = result.data?.messages?.[0] ?? result.messages?.[0] ?? null;
      if (!message) return null;
      const labels = message.labelIds ?? message.label_ids ?? [];
      return {
        id: message.id,
        threadId: message.threadId ?? message.thread_id,
        folder: labels.includes("SPAM") ? "spam" : "inbox",
      };
    },
    moveFromSpamToInbox({ userId, connectedAccountId, messageId }) {
      return execute("GMAIL_BATCH_MODIFY_MESSAGES", {
        userId,
        connectedAccountId,
        arguments: { ids: [messageId], add_label_ids: ["INBOX"], remove_label_ids: ["SPAM"] },
      });
    },
    markImportant({ userId, connectedAccountId, messageId }) {
      return execute("GMAIL_ADD_LABEL_TO_EMAIL", {
        userId,
        connectedAccountId,
        arguments: { message_id: messageId, label_id: "IMPORTANT" },
      });
    },
    replyToThread({ userId, connectedAccountId, threadId, body }) {
      return execute("GMAIL_REPLY_TO_THREAD", {
        userId,
        connectedAccountId,
        arguments: { thread_id: threadId, body },
      });
    },
  };
}
```

- [ ] **Step 4: Add package script**

In `apps/worker/package.json`:

```json
"warmup": "node src/warmup-worker.mjs"
```

- [ ] **Step 5: Verify against current Composio schema before merging**

Use the connected Gmail account from Composio dashboard and run one read-only search for an impossible token:

```powershell
$env:COMPOSIO_API_KEY=$env:Composio_api_key
npm.cmd run warmup --workspace @warmailer/worker -- --check-composio-only
```

Expected: returns zero Gmail messages and does not write labels or send replies.

---

## Task 5: Warmup Worker Cycle

**Files:**
- Create: `apps/worker/src/warmup-worker.mjs`
- Modify: `apps/worker/src/mail-worker.mjs`
- Modify: `apps/worker/test/warmup-worker.test.mjs`

**Interfaces:**
- Produces `runWarmupCycle({ db, sendMail, gmail, now, limit })`.
- Produces `selectedWarmupJobs(args: string[]): { schedule: boolean; send: boolean; check: boolean }`.
- Reuses `sendSmtp(payload, config)` from `mail-worker.mjs`.

- [ ] **Step 1: Write failing scheduling test**

```js
test("schedules one warmup message for each enabled mailbox under its daily limit", async () => {
  const inserted = [];
  const result = await runWarmupCycle({
    now: new Date("2026-08-14T10:00:00.000Z"),
    db: {
      getWarmupReadyMailboxes: async () => [{
        id: "mb1",
        workspace_id: "ws1",
        email_address: "sender@example.com",
        warmup_daily_limit: 25,
        warmup_daily_rampup: 5,
        warmup_randomize_daily_count: false,
        warmup_reply_rate_percent: 20,
        warmup_started_at: "2026-08-14T00:00:00.000Z",
        sent_today: 0,
      }],
      getWarmupSeeds: async () => [{ id: "seed1", workspace_id: "ws1", email_address: "seed@gmail.com" }],
      insertWarmupMessage: async (row) => inserted.push(row),
      claimWarmupMessages: async () => [],
      getSentWarmupMessagesNeedingCheck: async () => [],
    },
    sendMail: async () => {},
    gmail: {},
  });

  assert.equal(result.scheduled, 1);
  assert.equal(inserted[0].mailbox_id, "mb1");
  assert.equal(inserted[0].seed_account_id, "seed1");
  assert.match(inserted[0].body_text, /WMUP-/);
});
```

- [ ] **Step 2: Write failing send test**

```js
test("sends claimed warmup message through the sender mailbox", async () => {
  const calls = [];
  const result = await runWarmupCycle({
    db: {
      getWarmupReadyMailboxes: async () => [],
      getWarmupSeeds: async () => [],
      claimWarmupMessages: async () => [{
        id: "warm1",
        workspace_id: "ws1",
        mailbox_id: "mb1",
        seed_account_id: "seed1",
        token: "WMUP-1",
        subject: "Quick note",
        body_text: "Checking in WMUP-1",
        sender: { email_address: "sender@example.com", display_name: "Sender", encrypted_app_password: {} },
        seed: { email_address: "seed@gmail.com" },
      }],
      markWarmupSent: async (id, messageId) => calls.push(["sent", id, messageId]),
      insertWarmupEvent: async (row) => calls.push(["event", row.event_type]),
      getSentWarmupMessagesNeedingCheck: async () => [],
    },
    decryptSecret: () => "app-password",
    sendMail: async (payload) => {
      calls.push(["mail", payload.from, payload.to, payload.subject]);
      return { messageId: "<zoho-warmup-1@example.com>" };
    },
    gmail: {},
  });

  assert.equal(result.sent, 1);
  assert.deepEqual(calls[0], ["mail", "Sender <sender@example.com>", "seed@gmail.com", "Quick note"]);
  assert.deepEqual(calls[1], ["sent", "warm1", "<zoho-warmup-1@example.com>"]);
});
```

- [ ] **Step 3: Write failing placement/rescue/reply test**

```js
test("records spam placement, rescues it, marks important, and sometimes replies", async () => {
  const calls = [];
  const result = await runWarmupCycle({
    db: {
      getWarmupReadyMailboxes: async () => [],
      getWarmupSeeds: async () => [],
      claimWarmupMessages: async () => [],
      getSentWarmupMessagesNeedingCheck: async () => [{
        id: "warm1",
        workspace_id: "ws1",
        mailbox_id: "mb1",
        seed_account_id: "seed1",
        token: "WMUP-1",
        sender: { warmup_reply_rate_percent: 100 },
        seed: { composio_user_id: "seed-user", composio_connected_account_id: "ca_seed" },
      }],
      markWarmupPlacement: async (id, folder, gmailMessageId, threadId) => calls.push(["placement", folder, gmailMessageId, threadId]),
      markWarmupRescued: async (id) => calls.push(["rescued", id]),
      markWarmupImportant: async (id) => calls.push(["important", id]),
      markWarmupReplied: async (id) => calls.push(["replied", id]),
      insertWarmupEvent: async (row) => calls.push(["event", row.event_type]),
    },
    gmail: {
      findWarmupMessage: async () => ({ id: "gmail-1", threadId: "thread-1", folder: "spam" }),
      moveFromSpamToInbox: async () => calls.push(["gmail", "move"]),
      markImportant: async () => calls.push(["gmail", "important"]),
      replyToThread: async () => calls.push(["gmail", "reply"]),
    },
    shouldReply: (sender) => Number(sender.warmup_reply_rate_percent) === 100,
    sendMail: async () => {},
  });

  assert.equal(result.savedFromSpam, 1);
  assert.deepEqual(calls.filter((call) => call[0] === "gmail").map((call) => call[1]), ["move", "important", "reply"]);
});
```

- [ ] **Step 4: Implement scheduling**

Rules:

- Pick only `mailboxes.warmup_enabled = true` with status `connected` or `warming`.
- Count sent today by sender mailbox timezone.
- Calculate today's effective target from `warmup_started_at`, `warmup_daily_rampup`, and `warmup_daily_limit`.
- Do not schedule above today's effective target.
- If `warmup_randomize_daily_count = true`, choose a daily target between the previous ramp step and the current ramp target.
- Pick seed account by fewest received in the last 24 hours.
- Spread `scheduled_for` randomly inside the sender window.
- Generate token format `WMUP-${randomUUID()}` and include it in the body.

Ramp-up math:

```js
export function warmupTargetForDay(mailbox, now) {
  const startedAt = mailbox.warmup_started_at ? new Date(mailbox.warmup_started_at) : now;
  const day = Math.max(1, Math.floor((now - startedAt) / 86400000) + 1);
  const max = Number(mailbox.warmup_daily_limit ?? 25);
  const ramp = Number(mailbox.warmup_daily_rampup ?? 5);
  const target = Math.min(max, day * ramp);
  if (!mailbox.warmup_randomize_daily_count) return target;
  const floor = Math.max(1, target - ramp + 1);
  return floor + Math.floor(Math.random() * (target - floor + 1));
}
```

Templates:

```js
const TEMPLATES = [
  { subject: "Quick note", body: "Just confirming this landed correctly. {{token}}" },
  { subject: "Following up", body: "Thanks for checking this when you get a minute. {{token}}" },
  { subject: "Small update", body: "This is the short update I mentioned earlier. {{token}}" },
  { subject: "Question for later", body: "Putting this here so we can find it again. {{token}}" },
];
```

- [ ] **Step 5: Implement sending**

For each claimed row:

```js
await sendMail({
  host: mailbox.smtp_host,
  port: mailbox.smtp_port,
  user: mailbox.email_address,
  pass: decryptSecret(mailbox.encrypted_app_password, mailbox.id),
  from: `${mailbox.display_name} <${mailbox.email_address}>`,
  to: seed.email_address,
  subject: warmup.subject,
  text: warmup.body_text,
});
```

Then update `warmup_messages.status = 'sent'`, store `sender_provider_message_id`, and insert warmup event `sent`.

- [ ] **Step 6: Implement placement check**

For sent rows older than 90 seconds and not checked:

```js
const found = await gmail.findWarmupMessage({
  userId: seed.composio_user_id,
  connectedAccountId: seed.composio_connected_account_id,
  token: warmup.token,
});
```

Behavior:

- No match: leave as `sent`; check again on next cycle until 24 hours old.
- Inbox match: status `landed_inbox`, event `landed_inbox`.
- Spam match: event `landed_spam`, call rescue, status `saved_from_spam`, event `saved_from_spam`.

- [ ] **Step 7: Implement Gmail engagement**

Rules:

- Always rescue spam placements.
- Mark important for spam-rescued messages and 25 percent of inbox placements.
- Reply according to `warmup_reply_rate_percent`, only once per warmup message.
- Reply text comes from a static list and includes no token.

```js
const REPLIES = [
  "Got it, thanks.",
  "Received this one.",
  "Looks good on my side.",
  "Thanks, this came through.",
];
```

- [ ] **Step 8: Verify**

Run:

```powershell
npm.cmd test --workspace @warmailer/worker -- warmup-worker.test.mjs
npm.cmd test --workspace @warmailer/worker -- mail-worker.test.mjs
```

Expected: pass.

---

## Task 6: Warmup Cron Route

**Files:**
- Create: `apps/web/app/api/cron/warmup/route.ts`
- Modify: `vercel.json`
- Modify: `apps/web/test/cron-send.test.ts`

**Interfaces:**
- Consumes `CRON_SECRET`.
- Consumes `COMPOSIO_API_KEY` or current local fallback `Composio_api_key`.
- Produces `GET /api/cron/warmup`.

- [ ] **Step 1: Add failing cron tests**

Add tests next to existing cron-send tests:

```ts
it("requires bearer cron secret for warmup", async () => {
  vi.stubEnv("CRON_SECRET", "cron-secret");
  const mod = await import("../app/api/cron/warmup/route");

  const response = await mod.GET(new Request("https://warmailer-app.vercel.app/api/cron/warmup"));

  expect(response.status).toBe(401);
});

it("loads warmup composio config without exposing it to the browser", async () => {
  vi.stubEnv("COMPOSIO_API_KEY", "composio-secret");
  const mod = await import("../app/api/cron/warmup/route");

  expect(mod.loadWarmupConfig().composioApiKey).toBe("composio-secret");
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```powershell
npm.cmd test --workspace @warmailer/web -- cron-send.test.ts
```

- [ ] **Step 3: Add cron route**

Mirror `apps/web/app/api/cron/send/route.ts`:

```ts
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = envValue("CRON_SECRET");
  if (!secret) return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = await runWarmupCycle(buildWarmupDeps(loadWarmupConfig()));
  return NextResponse.json(summary);
}
```

- [ ] **Step 4: Add Vercel cron**

Modify `vercel.json`:

```json
{
  "path": "/api/cron/warmup",
  "schedule": "*/10 * * * *"
}
```

- [ ] **Step 5: Verify**

Run:

```powershell
npm.cmd test --workspace @warmailer/web -- cron-send.test.ts
npm.cmd run typecheck --workspace @warmailer/web
```

Expected: pass.

---

## Task 7: Mailboxes Warmup UI

**Files:**
- Modify: `apps/web/components/mailboxes/mailboxes-workspace.tsx`
- Modify: `apps/web/app/styles/pages.css`
- Modify: `apps/web/test/frontend-invariants.test.ts`

**Interfaces:**
- Consumes `mailboxes`, `warmupStats`, and `warmupSeeds` props.
- Calls `PATCH /api/warmup/mailboxes`.
- Calls `POST /api/warmup/seeds`.

- [ ] **Step 1: Add failing UI invariant**

```ts
it("shows warmup metrics, controls, and Gmail seed count on mailboxes", async () => {
  const component = await source("components/mailboxes/mailboxes-workspace.tsx");

  expect(component).toContain("Warmup reputation");
  expect(component).toContain("Saved from spam");
  expect(component).toContain("Landed in inbox");
  expect(component).toContain("Warmup emails sent");
  expect(component).toContain("Gmail seed accounts");
  expect(component).toContain("warmupDailyLimit");
  expect(component).toContain("warmupDailyRampup");
  expect(component).toContain("warmupRandomizeDailyCount");
  expect(component).toContain("warmupReplyRatePercent");
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```powershell
npm.cmd test --workspace @warmailer/web -- frontend-invariants.test.ts
```

- [ ] **Step 3: Replace the placeholder Warmup card**

UI sections:

- Summary last 7 days:
  - Warmup emails sent
  - Landed in inbox
  - Saved from spam
  - Emails received/replied
- Per-mailbox table:
  - mailbox email
  - daily warmup sent against today's ramped target
  - warmup enabled
  - max warmup emails per day
  - daily ramp-up increment
  - randomized daily volume toggle
  - reply rate percent
  - reputation percent
  - issue text
  - action toggle/edit
- Seed account panel:
  - current Gmail seed count
  - form fields for email, Composio user id, Composio connected account id

Do not add a separate top-level `/warmup` route for MVP; keep warmup inside Mailboxes as the manual already describes.

- [ ] **Step 4: Add mailbox controls**

Each row has:

```tsx
<input
  type="number"
  min={1}
  max={100}
  value={warmupDailyLimit}
  onChange={(event) => setWarmupDailyLimit(Number(event.target.value) || 1)}
/>
<input
  type="number"
  min={1}
  max={100}
  value={warmupDailyRampup}
  onChange={(event) => setWarmupDailyRampup(Number(event.target.value) || 1)}
/>
<label>
  <input
    type="checkbox"
    checked={warmupRandomizeDailyCount}
    onChange={(event) => setWarmupRandomizeDailyCount(event.target.checked)}
  />
  Randomise number of warmup emails per day
</label>
<input
  type="number"
  min={0}
  max={100}
  value={warmupReplyRatePercent}
  onChange={(event) => setWarmupReplyRatePercent(Number(event.target.value) || 0)}
/>
<button type="button" onClick={saveWarmupSettings}>
  {warmupEnabled ? "Disable warmup" : "Enable warmup"}
</button>
```

`saveWarmupSettings` calls:

```ts
await fetch("/api/warmup/mailboxes", {
  method: "PATCH",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    mailboxId,
    warmupEnabled,
    warmupDailyLimit,
    warmupDailyRampup,
    warmupRandomizeDailyCount,
    warmupReplyRatePercent,
  }),
});
```

- [ ] **Step 5: Add seed form**

Fields:

```tsx
emailAddress
composioUserId
composioConnectedAccountId
```

Submit:

```ts
await fetch("/api/warmup/seeds", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ emailAddress, composioUserId, composioConnectedAccountId }),
});
```

- [ ] **Step 6: Verify**

Run:

```powershell
npm.cmd test --workspace @warmailer/web -- frontend-invariants.test.ts
npm.cmd run typecheck --workspace @warmailer/web
```

Expected: pass.

---

## Task 8: Live One-Seed Audit Run

**Files:**
- No production file changes unless a Composio payload mismatch is found.

**Interfaces:**
- Uses one Gmail seed account already connected in Composio.
- Uses one low-risk Zoho sender mailbox.

- [ ] **Step 1: Confirm env without printing secrets**

Run:

```powershell
Select-String -Path .env.local -Pattern "COMPOSIO|Composio|GMAIL|CRON" | ForEach-Object { ($_ -replace "=.*$", "=***") }
```

Expected:

```text
Composio_api_key=***
CRON_SECRET=***
```

If `COMPOSIO_API_KEY` is missing locally, set it from `Composio_api_key` for the process only.

- [ ] **Step 2: Register one seed account in UI**

Register:

```json
{
  "emailAddress": "the.connected.seed@gmail.com",
  "composioUserId": "the Composio user id for that Gmail",
  "composioConnectedAccountId": "the Composio connected account id for that Gmail"
}
```

- [ ] **Step 3: Enable one sender mailbox**

Use:

```json
{
  "warmupEnabled": true,
  "warmupDailyLimit": 3
}
```

- [ ] **Step 4: Run one cycle manually**

Run:

```powershell
npm.cmd run warmup --workspace @warmailer/worker
```

Expected summary:

```json
{
  "scheduled": 1,
  "sent": 0,
  "checked": 0,
  "savedFromSpam": 0,
  "replied": 0,
  "failed": 0
}
```

- [ ] **Step 5: Run again after scheduled time**

Expected summary:

```json
{
  "scheduled": 0,
  "sent": 1,
  "checked": 0,
  "savedFromSpam": 0,
  "replied": 0,
  "failed": 0
}
```

- [ ] **Step 6: Run placement check after Gmail receives it**

Expected outcome:

- If inbox: `landed_inbox` event exists.
- If spam: `landed_spam` and `saved_from_spam` events exist, Gmail message no longer has `SPAM`, and has `INBOX`.
- If reply selected: `reply_sent` event exists and Zoho receives the seed reply in its inbox.

- [ ] **Step 7: Verify UI**

Mailboxes page shows:

- Warmup enabled: Yes
- Daily limit: current sent count over 3
- Warmup reputation: 100 percent if inbox, lower if spam before rescue
- Summary last 7 days counts match `warmup_mailbox_stats`

---

## Task 9: Final Verification

Run:

```powershell
node --test supabase/tests/warmup-static.test.mjs
npm.cmd test --workspace @warmailer/contracts
npm.cmd test --workspace @warmailer/worker
npm.cmd test --workspace @warmailer/web
npm.cmd run typecheck --workspace @warmailer/web
npm.cmd run build --workspace @warmailer/web
```

Manual Supabase checks:

```sql
select workspace_id, token, count(*)
from public.warmup_messages
group by 1, 2
having count(*) > 1;

select wm.id
from public.warmup_messages wm
join public.mailboxes mb on mb.id = wm.mailbox_id
where wm.workspace_id <> mb.workspace_id;

select we.id
from public.warmup_events we
join public.warmup_messages wm on wm.id = we.warmup_message_id
where we.workspace_id <> wm.workspace_id;
```

Expected: all SQL checks return zero rows.

---

## Rollout

1. Add schema and read-only UI with zero warmup enabled.
2. Register one Gmail seed account from Composio.
3. Enable one sender mailbox at `warmup_daily_limit = 3`.
4. Run manual worker cycles until one full send, placement check, rescue, and optional reply is proven.
5. Enable the cron route at every 10 minutes.
6. Add remaining Gmail seed accounts.
7. Raise warmup limit gradually to 25 per mailbox only after 7-day inbox placement is stable.

## Code-Bugger Connection Audit

1. **Connection node:** sender mailbox status and daily limits. **Broken link risk:** warmup could consume campaign capacity or make campaigns send through warming mailboxes unexpectedly. **Simplest fix:** keep warmup counts in `warmup_messages`; do not increment `mailbox_daily_usage`; campaign capacity remains unchanged.
2. **Connection node:** Gmail seed account identity. **Broken link risk:** one Composio key with many Gmail connections can send actions through the wrong seed. **Simplest fix:** store `composio_user_id` and `composio_connected_account_id` per `warmup_seed_accounts` row and pass both to every Gmail call.
3. **Connection node:** cron claiming. **Broken link risk:** overlapping cron runs duplicate warmup sends. **Simplest fix:** `claim_warmup_messages()` uses `for update skip locked` and service-role-only execution.
4. **Connection node:** stats displayed in UI. **Broken link risk:** UI counters drift from worker events. **Simplest fix:** `warmup_mailbox_stats` view derives all displayed counts from `warmup_messages`.
5. **Connection node:** campaign inbox sync. **Broken link risk:** Gmail seed replies pollute the prospect master inbox. **Simplest fix:** warmup replies stay in `warmup_messages`/`warmup_events`; `inbox-sync.mjs` remains campaign-only.

Verdict: **SAFE**.

## Self-Review

- Spec coverage: frontend controls, backend API routes, Supabase schema/RLS, cron, worker, Composio Gmail actions, reputation metrics, one-seed rollout, and tests are covered.
- Placeholder scan: no unresolved marker words or unspecified "add handling" steps remain.
- Type consistency: `WarmupMailboxStats`, `WarmupSeedAccount`, `warmup_mailbox_stats`, `warmup_seed_accounts`, `warmup_messages`, and `warmup_events` names are consistent across tasks.
- Ponytail check: no top-level Warmup app section, no Composio SDK dependency until fetch is proven insufficient, no campaign-message reuse that would contaminate prospect reporting.
