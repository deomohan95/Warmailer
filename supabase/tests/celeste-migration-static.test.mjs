import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../migrations/20260812062058_celeste_tenancy_import_enrichment_groundwork.sql", import.meta.url),
  "utf8",
);

test("RLS membership helpers live in a private schema and are not directly executable by browser roles", () => {
  assert.match(migration, /create schema if not exists private;/i);
  assert.match(migration, /create or replace function private\.is_workspace_member/i);
  assert.match(migration, /create or replace function private\.workspace_role_for/i);
  assert.match(migration, /revoke execute on function private\.is_workspace_member\(uuid\) from public, anon, authenticated, service_role;/i);
  assert.match(migration, /revoke execute on function private\.workspace_role_for\(uuid\) from public, anon, authenticated, service_role;/i);
  assert.doesNotMatch(migration, /create or replace function public\.is_workspace_member/i);
});

test("tenant and worker lookup columns have explicit indexes", () => {
  for (const indexName of [
    "workspace_members_user_workspace_idx",
    "all_leads_mmp_workspace_email_status_idx",
    "lead_imports_workspace_status_idx",
    "lead_import_rows_workspace_import_idx",
    "enrichment_batches_workspace_status_idx",
    "enrichment_items_workspace_status_lease_idx",
    "enrichment_items_workspace_lead_idx",
    "apify_runs_workspace_item_idx",
  ]) {
    assert.match(migration, new RegExp(`create index if not exists ${indexName}`, "i"));
  }
});

test("all_leads_mmp identity indexes are workspace-scoped and partial", () => {
  assert.match(migration, /create unique index if not exists all_leads_mmp_workspace_linkedin_uidx[\s\S]+where linkedin_url_normalized is not null;/i);
  assert.match(migration, /create unique index if not exists all_leads_mmp_workspace_name_company_uidx[\s\S]+where linkedin_url_normalized is null and name_company_normalized is not null;/i);
});

test("migration does not contain forbidden production or HRMS references", () => {
  assert.doesNotMatch(migration, /\bdb push\b/i);
  assert.doesNotMatch(migration, /\blinked\b/i);
  assert.doesNotMatch(migration, /hrms/i);
});

