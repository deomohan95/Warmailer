# Simple Company Pattern Enrichment Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Warmailer find more verified emails for less money by reusing company email formats before spending on Apify again.

**Architecture:** Keep the existing “Find emails” button, existing enrichment queue, and existing worker. Add one database table for verified company email formats and one small helper module. For new enrichment runs, verification moves into the worker: saved pattern guess → Reoon verify → bulk Apify → Reoon verify/train pattern → same-batch pattern guesses → Reoon verify → one-by-one fallback → Reoon verify. The existing “Verify emails” button stays only for older leads already stuck in `found`.

**Tech Stack:** Next.js API route, Node worker, Supabase Postgres/REST, Apify, Reoon, existing `node --test`.

**Spec:** Ponytail/simple version approved by user on 2026-10-06.

## Global Constraints

- Do not save any guessed email unless Reoon says safe/valid.
- Do not save any Apify-found email from new runs unless Reoon says safe/valid.
- Do not run Reoon twice for the same lead/email candidate in one worker run.
- Do not overwrite leads that already have an email.
- Do not learn patterns from Gmail/Yahoo/Outlook/iCloud/free domains.
- Do not add a second button.
- Do not add a guess audit table yet.
- Do not build fancy UI/status screens yet.
- Do not auto-enrich during CSV import yet; cached patterns apply when the user clicks “Find emails”.

## Files

- Create `supabase/migrations/<timestamp>_add_company_email_patterns.sql`
- Create `packages/imports/src/email-patterns.mjs`
- Create `packages/imports/test/email-patterns.test.mjs`
- Modify `apps/worker/src/enrichment-worker.mjs`
- Modify `apps/worker/test/enrichment-worker.test.mjs`
- Modify `docs/USER_MANUAL.md`

## Task 1: Add one DB table

- [x] Create `company_email_patterns`:
  - `id uuid primary key`
  - `workspace_id uuid not null`
  - `company_key text not null`
  - `company_name_sample text`
  - `domain text not null`
  - `pattern text not null`
  - `verified_count integer not null default 0`
  - `rejected_count integer not null default 0`
  - `last_seen_at timestamptz not null default now()`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`

- [x] Add unique constraint:
  - `(workspace_id, company_key, domain, pattern)`

- [x] Add index:
  - `(workspace_id, company_key)`

- [x] Enable RLS and copy the same workspace policy style as existing enrichment tables.

## Task 2: Add pattern helper

- [x] Create `packages/imports/src/email-patterns.mjs`.

- [x] Add:
  - `normalizeCompanyKey(company)`
  - `splitPersonName(name)`
  - `emailDomain(email)`
  - `isBusinessDomain(domain)`
  - `detectEmailPattern({ name, email })`
  - `applyEmailPattern({ name, domain, pattern })`

- [x] Support only common patterns first:
  - `first.last`
  - `flast`
  - `firstl`
  - `firstlast`

- [x] Test:
  - `John Smith` + `john.smith@acme.com` detects `first.last`
  - `John Smith` + `jsmith@acme.com` detects `flast`
  - free domains are rejected
  - one-word names do not guess

## Task 3: Upgrade worker flow

- [x] Expand the worker's queued item lookup so each item has the lead `name`, `company`, and current `email`.

- [x] Add a small per-run verification cache keyed by:
  - `lead_id`
  - lowercased email candidate

- [x] Add `verifyCandidate(item, email)` inside `apps/worker/src/enrichment-worker.mjs`:
  - if this lead/email was already checked in this run, reuse the result
  - otherwise call `verifyEmailWithReoon`
  - return only `{ verified: true }` results as saveable

- [x] Before Apify, load saved patterns for queued leads by company.

- [x] For each lead with a saved pattern:
  - guess email
  - verify with `verifyCandidate`
  - if safe/valid, save email and set `email_status = 'verified'`
  - if not valid, keep it in the normal flow

- [x] Run bulk Apify for remaining leads.

- [x] Verify every bulk-found email with `verifyCandidate` before saving.

- [x] For verified bulk emails:
  - save email as `email_status = 'verified'`
  - detect company pattern
  - upsert into `company_email_patterns`
  - increment `verified_count`

- [x] For bulk-found emails that fail Reoon:
  - do not save the email
  - keep the lead in the remaining flow

- [x] For bulk misses from companies where this same batch found a verified pattern:
  - guess email
  - verify with `verifyCandidate`
  - save only safe/valid guesses
  - increment `rejected_count` when a guess fails

- [x] Run the existing one-by-one finder only for leads still missing after all above steps.

- [x] Verify every one-by-one-found email with `verifyCandidate` before saving.

- [x] If all phases fail, set the lead to `not_found`.

- [x] Keep `apps/web/app/api/email-verification/route.ts` for manual verification of legacy `found` leads only.

## Task 4: Tests

- [x] Add helper tests:

```bash
node --test packages/imports/test/email-patterns.test.mjs
```

- [x] Add worker tests proving:
  - saved pattern avoids Apify
  - same lead/email candidate is verified only once per worker run
  - bulk email must pass Reoon before save
  - verified bulk email trains pattern table
  - same-batch miss gets guessed from verified company pattern
  - bad Reoon guess is not saved
  - one-by-one gets only true leftovers

- [x] Run:

```bash
npm test --workspace @warmailer/worker
```

## Task 5: Docs + deploy

- [x] Update `docs/USER_MANUAL.md`:
  - “Find emails checks saved company formats first, then bulk finder, then verified same-company guesses, then one-by-one fallback.”

- [ ] Apply migration to production.

- [ ] Deploy latest code.

- [ ] Restart enrichment worker/timer.

- [ ] Smoke test with 20 leads:
  - known company pattern should enrich without Apify
  - unknown company should go bulk
  - same-company misses should get guessed and Reoon-verified

## What we are intentionally skipping

- No second table for guess audit.
- No UI rebuild.
- No import-time external Reoon calls.
- No big backfill script yet.

Add those later only if we actually need them.
