import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const migrationsDir = new URL("../migrations/", import.meta.url);
const migrationName = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .find((name) => name.includes("campaign_inbox"));

assert.ok(migrationName, "expected a campaign_inbox migration");

const migration = readFileSync(new URL(migrationName, migrationsDir), "utf8");

test("campaign source tables are workspace-owned and linked to leads and mailboxes", () => {
  for (const table of ["campaigns", "campaign_sequence_steps", "campaign_leads", "campaign_mailboxes"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }

  assert.match(migration, /workspace_id uuid not null references public\.workspaces\(id\)/i);
  assert.match(migration, /foreign key \(lead_id, workspace_id\) references public\.all_leads_mmp\(id, workspace_id\)/i);
  assert.match(migration, /foreign key \(mailbox_id, workspace_id\) references public\.mailboxes\(id, workspace_id\)/i);
  assert.match(migration, /unique \(campaign_id, lead_id\)/i);
  assert.match(migration, /unique \(campaign_id, mailbox_id\)/i);
});

test("campaign pages read capacity from mailbox_capacity instead of a stored campaign number", () => {
  assert.match(migration, /create or replace view public\.campaign_list/i);
  assert.match(migration, /with \(security_invoker = true\)/i);
  assert.match(migration, /left join public\.mailbox_capacity mc/i);
  assert.match(migration, /sum\(mc\.available_today\) filter \(where mc\.status = 'connected'\)/i);
  assert.doesNotMatch(migration, /daily_capacity\s+integer/i);
});

test("campaign activity and inbox rows keep full backtracking lineage", () => {
  for (const table of ["inbox_threads", "messages", "message_events"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }

  assert.match(migration, /foreign key \(campaign_id, workspace_id\) references public\.campaigns\(id, workspace_id\)/i);
  assert.match(migration, /foreign key \(mailbox_id, workspace_id\) references public\.mailboxes\(id, workspace_id\)/i);
  assert.match(migration, /foreign key \(lead_id, workspace_id\) references public\.all_leads_mmp\(id, workspace_id\)/i);
  assert.match(migration, /foreign key \(message_id, workspace_id\) references public\.messages\(id, workspace_id\)/i);
});

test("inbox and campaign projections are read-only, RLS-safe, and do not fake tracking metrics", () => {
  for (const view of ["campaign_list", "campaign_activity", "inbox_thread_list", "inbox_thread_messages"]) {
    assert.match(migration, new RegExp(`create or replace view public\\.${view}[\\s\\S]+with \\(security_invoker = true\\)`, "i"));
    assert.match(migration, new RegExp(`grant select on public\\.${view} to authenticated;`, "i"));
  }

  assert.doesNotMatch(migration, /open_rate/i);
  assert.doesNotMatch(migration, /reply_rate/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.doesNotMatch(migration, /hrms/i);
});

test("dashboard overview is rewired to real campaign and inbox counts", () => {
  assert.match(migration, /create or replace view public\.dashboard_overview/i);
  assert.match(migration, /active_campaign_count/i);
  assert.match(migration, /unread_thread_count/i);
  assert.match(migration, /from public\.campaigns/i);
  assert.match(migration, /from public\.inbox_threads/i);
});
