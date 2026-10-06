import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../migrations/20261006170000_add_company_email_patterns.sql", import.meta.url),
  "utf8",
);

test("company email patterns migration is workspace scoped and RLS protected", () => {
  assert.match(migration, /create table if not exists public\.company_email_patterns/i);
  assert.match(migration, /unique \(workspace_id, company_key, domain, pattern\)/i);
  assert.match(migration, /alter table public\.company_email_patterns enable row level security/i);
  assert.match(migration, /private\.workspace_role_for\(workspace_id\) in \('owner', 'admin'\)/i);
});
