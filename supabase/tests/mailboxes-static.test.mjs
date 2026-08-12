import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../migrations/20260812095925_add_mailboxes.sql", import.meta.url),
  "utf8",
);

test("mailboxes are workspace-owned and app passwords are write-only", () => {
  assert.match(migration, /create table if not exists public\.mailboxes/i);
  assert.match(migration, /workspace_id uuid not null references public\.workspaces\(id\)/i);
  assert.match(migration, /encrypted_app_password jsonb not null/i);
  assert.match(migration, /app_password_configured boolean not null default true/i);
  assert.doesNotMatch(migration, /\bapp_password\s+text\b/i);
});

test("mailbox capacity is derived from the mailbox source row and daily usage row", () => {
  assert.match(migration, /create table if not exists public\.mailbox_daily_usage/i);
  assert.match(migration, /daily_hard_limit integer not null/i);
  assert.match(migration, /reserved_count integer not null default 0/i);
  assert.match(migration, /greatest\(0, m\.daily_hard_limit - coalesce\(u\.used_count, 0\) - coalesce\(u\.reserved_count, 0\)\) as available_today/i);
});

test("mailbox linkage can be backtracked by workspace and mailbox", () => {
  assert.match(migration, /create table if not exists public\.mailbox_events/i);
  assert.match(migration, /foreign key \(mailbox_id, workspace_id\) references public\.mailboxes\(id, workspace_id\)/i);
  assert.match(migration, /mailbox_events_workspace_mailbox_idx/i);
});

test("mailbox tables and capacity view use RLS-safe access", () => {
  for (const name of ["mailboxes", "mailbox_daily_usage", "mailbox_events"]) {
    assert.match(migration, new RegExp(`alter table public\\.${name} enable row level security`, "i"));
  }

  assert.match(migration, /create or replace view public\.mailbox_capacity[\s\S]+with \(security_invoker = true\)/i);
  assert.doesNotMatch(migration, /security definer/i);
});

test("browser roles can read derived usage and events but cannot write worker-owned counters", () => {
  assert.match(migration, /grant select on public\.mailbox_daily_usage to authenticated;/i);
  assert.match(migration, /grant select on public\.mailbox_events to authenticated;/i);
  assert.doesNotMatch(migration, /grant select, insert, update on public\.mailbox_daily_usage to authenticated;/i);
  assert.doesNotMatch(migration, /grant select, insert on public\.mailbox_events to authenticated;/i);
  assert.doesNotMatch(migration, /admins can manage mailbox usage/i);
});
