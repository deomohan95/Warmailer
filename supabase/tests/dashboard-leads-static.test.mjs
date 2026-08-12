import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../migrations/20260812101110_add_dashboard_lead_views.sql", import.meta.url),
  "utf8",
);

test("lead page reads from one RLS-safe projection over all_leads_mmp", () => {
  assert.match(migration, /create or replace view public\.lead_list/i);
  assert.match(migration, /with \(security_invoker = true\)/i);
  assert.match(migration, /from public\.all_leads_mmp/i);
  assert.match(migration, /workspace_id/i);
  assert.match(migration, /grant select on public\.lead_list to authenticated;/i);
});

test("lead readiness counts are derived from all_leads_mmp without a cache table", () => {
  assert.match(migration, /create or replace view public\.lead_readiness/i);
  assert.match(migration, /count\(\*\) as imported_count/i);
  assert.match(migration, /filter \(where email is not null and email_status = 'found'\)/i);
  assert.match(migration, /filter \(where email is null and email_status in \('not_enriched', 'not_found', 'failed'\)\)/i);
  assert.doesNotMatch(migration, /create table if not exists public\.lead_readiness/i);
});

test("dashboard overview joins lead readiness and mailbox capacity instead of duplicating numbers", () => {
  assert.match(migration, /create or replace view public\.dashboard_overview/i);
  assert.match(migration, /from public\.workspaces w/i);
  assert.match(migration, /left join public\.lead_readiness lr/i);
  assert.match(migration, /left join public\.mailbox_capacity mc/i);
  assert.match(migration, /coalesce\(sum\(mc\.available_today\) filter \(where mc\.status = 'connected'\), 0\) as send_capacity_today/i);
  assert.doesNotMatch(migration, /create table if not exists public\.dashboard_overview/i);
});

test("dashboard and lead views do not touch HRMS or expose secrets", () => {
  assert.doesNotMatch(migration, /hrms/i);
  assert.doesNotMatch(migration, /encrypted_app_password/i);
  assert.doesNotMatch(migration, /app_password/i);
  assert.doesNotMatch(migration, /security definer/i);
});
