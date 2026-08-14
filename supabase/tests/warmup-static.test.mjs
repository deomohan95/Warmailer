import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const migrationName = readdirSync(new URL("../migrations", import.meta.url)).find((name) =>
  name.includes("add_warmup"),
);
assert.ok(migrationName, "expected an add_warmup migration");
const migration = readFileSync(new URL(`../migrations/${migrationName}`, import.meta.url), "utf8");

function source(path) {
  const url = new URL(`../../${path}`, import.meta.url);
  assert.ok(existsSync(url), `expected ${path} to exist`);
  return readFileSync(url, "utf8");
}

test("warmup rows are workspace-owned and linked to sender and seed accounts", () => {
  for (const table of ["warmup_seed_accounts", "warmup_messages", "warmup_events"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /foreign key \(mailbox_id, workspace_id\) references public\.mailboxes\(id, workspace_id\)/i);
  assert.match(
    migration,
    /foreign key \(seed_account_id, workspace_id\) references public\.warmup_seed_accounts\(id, workspace_id\)/i,
  );
});

test("warmup settings include defaults and reply rate cap", () => {
  assert.match(migration, /warmup_enabled boolean not null default false/i);
  assert.match(migration, /warmup_daily_limit integer not null default 25/i);
  assert.match(migration, /warmup_daily_rampup integer not null default 5/i);
  assert.match(migration, /warmup_randomize_daily_count boolean not null default true/i);
  assert.match(migration, /warmup_reply_rate_percent integer not null default 20/i);
  assert.match(migration, /warmup_reply_rate_percent between 0 and 100/i);
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

test("warmup API routes use shared contracts and normalized Composio env", () => {
  const mailboxRoute = source("apps/web/app/api/warmup/mailboxes/route.ts");
  const seedRoute = source("apps/web/app/api/warmup/seeds/route.ts");
  const envExample = source(".env.example");

  assert.match(mailboxRoute, /WarmupMailboxUpdateInputSchema/);
  assert.match(seedRoute, /WarmupSeedCreateInputSchema/);
  assert.doesNotMatch(seedRoute, /Composio_api_key/);
  assert.match(envExample, /COMPOSIO_API_KEY=/);
  assert.match(envExample, /COMPOSIO_GMAIL_TOOLKIT_VERSION=20260721_00/);
});
