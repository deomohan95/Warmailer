# Warmailer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` per task and `superpowers:verification-before-completion` before every handoff. Steps use checkbox syntax for tracking.

**Goal:** Build a production-ready multi-tenant email campaign platform with Apollo CSV ingestion, two-stage Apify enrichment, Zoho delivery, follow-ups, master inbox, and performance reporting.

**Architecture:** A Next.js web app and a Node.js Hostinger worker share a tenant-isolated Supabase/Postgres data model. Dave owns product UI/API surfaces, Celeste owns tenancy/import/enrichment data paths, and Thor owns asynchronous mail delivery/inbox/tracking. Canonical contracts are frozen before parallel feature work.

**Tech Stack:** Node.js 24 locally (production floor Node.js 22), TypeScript strict, Next.js App Router, Supabase Auth/Postgres/Storage/RLS, pg-boss, Nodemailer, ImapFlow, MailParser, Zod, Pino, Vitest, Testing Library, Playwright, Docker.

## Global Constraints

- Never read, modify, migrate, grant, trigger, backfill, or reference HRMS tables.
- `all_leads_mmp` is the MMP lead source of truth.
- Every tenant-owned row has non-null `workspace_id` and enforced tenant-safe relationships.
- Browser code never receives service-role, Apify, encryption, or mailbox secrets.
- SMTP acceptance is not delivery; ambiguous crash-window sends are not automatically retried.
- Open rate is always labeled **Estimated open rate**.
- No implementation begins until shared types, status enums, ownership boundaries, and migrations are reviewed.

---

## Worker Sessions and Ownership

Run three sessions from the repository root:

```powershell
tmux new-session -d -s dave -c 'C:\Users\admin\Desktop\Warmailer'
tmux new-session -d -s celeste -c 'C:\Users\admin\Desktop\Warmailer'
tmux new-session -d -s thor -c 'C:\Users\admin\Desktop\Warmailer'
tmux list-sessions
```

Attach with `tmux attach -t dave`, `celeste`, or `thor`. Each worker uses a separate Git worktree/branch after repository initialization:

```text
dave    -> feat/web-app
celeste -> feat/data-import-enrichment
thor    -> feat/mail-worker
```

Ownership:

| Worker | Exclusive ownership | Must not edit |
|---|---|---|
| Dave | `app/`, `components/`, browser/server UI helpers, UI tests | migrations, worker internals |
| Celeste | `supabase/`, import/enrichment packages and workers | mail worker, inbox UI |
| Thor | `apps/worker/`, mail/tracking/inbox server logic | imports, enrichment, HRMS |

Shared files (`packages/contracts`, root manifests, lockfile) are changed only during coordination gates. Workers propose contract changes in notes; the integrator applies them.

## Integration Gates

1. Gate A: repository/tooling and shared contracts compile.
2. Gate B: tenancy schema/RLS and generated DB types pass adversarial tests.
3. Gate C: CSV import and enrichment APIs pass before Dave wires live lead screens.
4. Gate D: mailbox/campaign schema passes before Thor enables sending.
5. Gate E: master inbox and canonical events reconcile before dashboard completion.
6. Gate F: full build, E2E, migration replay, security checks, and staging soak pass.

## Shared Contracts

Create `packages/contracts/src/` with Zod schemas and inferred TypeScript types for:

```ts
type JobStatus = "queued" | "running" | "completed" | "completed_with_errors" | "failed" | "cancelled";
type WorkspaceRole = "owner" | "admin" | "member";
type EmailStatus = "not_enriched" | "queued" | "processing" | "found" | "not_found" | "failed";
type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "safety_paused" | "completed" | "stopped";
type MessageDirection = "inbound" | "outbound";
type MessageEventType = "queued" | "smtp_accepted" | "delivery_unknown" | "open" | "click" | "reply" | "bounce" | "unsubscribe" | "failed" | "suppressed";
type LeadSelection = { leadIds: string[] } | { filterToken: string; excludedLeadIds: string[] };
```

All APIs derive the active workspace from authenticated membership; they never trust a browser-supplied `workspace_id`.

---

## Task 1: Repository and Tooling Foundation — Integrator, then Dave

**Files:** root `package.json`, workspace config, lockfile, TypeScript/ESLint/Prettier configs, `.gitignore`, `apps/web`, `packages/contracts`, test configs.

- [ ] Initialize Git and commit the existing normalized env example and design documents; ensure `.env.local` is ignored.
- [ ] Scaffold the monorepo and Next.js app with strict TypeScript.
- [ ] Add pinned dependencies and scripts: `lint`, `typecheck`, `test`, `test:e2e`, `build`.
- [ ] Write failing smoke tests for the contract package and app shell.
- [ ] Implement minimal exports/app page and make tests pass.
- [ ] Create the three worktrees and tmux sessions only after the baseline commit.
- [ ] Verify `npm run lint && npm run typecheck && npm test && npm run build`.

**Gate A output:** all workers can build against the same frozen contracts.

## Task 2: Tenancy, Auth, and RLS — Celeste + Dave

**Celeste files:** generated Supabase migrations, SQL tests, generated database types.

**Dave files:** auth pages/callback/middleware, Supabase browser/server clients, workspace switcher, permission helpers.

- [ ] Inventory the real Supabase schema and every `all_leads_mmp` reference; record existing row ownership. Do not infer ownership.
- [ ] Write failing SQL tests proving user A cannot select/insert/update workspace B rows.
- [ ] Create `workspaces` and `workspace_members`; use membership rows as authorization source.
- [ ] Map existing MMP leads to a workspace; quarantine ambiguous rows before enforcing `NOT NULL`.
- [ ] Add `workspace_id` constraints, composite tenant-safe relationships, RLS policies with both `USING` and `WITH CHECK`, and explicit Data API grants.
- [ ] Add login, callback, logout, workspace selection, and Owner/Admin/Member permission tests.
- [ ] Generate DB types and verify direct REST/crafted-ID cross-tenant attempts fail.
- [ ] Run Supabase advisors and clean migration replay.

**Gate B output:** authenticated tenant shell with proven isolation and zero ambiguous unowned MMP rows.

## Task 3: CSV Import Pipeline — Celeste; UI by Dave after API freeze

**Celeste files:** import migrations, `packages/imports/`, server import routes, worker handlers, SQL/unit/integration tests.

**Dave files:** leads page, import dialog/preview/progress/rejections UI.

- [ ] Write failing parser tests for exact headers, BOM, quoted commas/newlines, Unicode, blank lines, reordered/extra headers, invalid URLs, repeated rows, and large streaming files.
- [ ] Add `lead_imports` and `lead_import_rows` with unique `(import_id,row_number)`.
- [ ] Add canonical LinkedIn normalization and fallback identity normalization tests.
- [ ] Add workspace-scoped unique indexes: LinkedIn first; `name+company` only when LinkedIn is absent.
- [ ] Implement private Storage upload and `POST /api/imports`, `GET /api/imports/:id`, and rejection download.
- [ ] Implement atomic upsert: refresh non-empty profile fields; never clear a found email.
- [ ] Derive counters from row actions in a final transaction.
- [ ] Build paginated lead table, import validation preview, progress, exclusions, and rejected-row download.
- [ ] Verify repeat upload and mid-import crash recovery produce no duplicate leads.

## Task 4: Two-Stage Bulk Enrichment — Celeste; UI by Dave

**Files:** enrichment migrations, Apify adapters, batch routes, queue handlers, leads bulk-action UI.

- [ ] Write state-machine tests distinguishing `found`, genuine `not_found`, retryable error, and terminal error.
- [ ] Add enrichment batches/items, Apify runs, and run-item mappings with atomic leases and unique run IDs.
- [ ] Implement server-resolved row/page/all-filtered selection; skip existing emails and in-flight leads.
- [ ] Call primary actor `UMdANQyqx3b2JVuxg` once per canonical URL with input key `linkedin`.
- [ ] Retry primary operational failures using bounded exponential backoff and jitter.
- [ ] Batch only genuine primary misses into fallback actor `q3wko0Sbx6ZAAB2xf` using `linkedinUrls`.
- [ ] Match fallback results to items by canonical URL and atomically update `all_leads_mmp`.
- [ ] Add progress counts, retry-failed action, and primary/fallback breakdown to UI.
- [ ] Verify two workers cannot create duplicate paid runs and no fallback batch mixes workspaces.

**Gate C output:** imported leads can be safely bulk-enriched end to end.

## Task 5: Mailbox and Campaign Data Model — Celeste contracts; Dave UI

**Files:** mailbox/campaign migrations and contracts; settings and campaign wizard UI.

- [ ] Add tenant-scoped `mailboxes`, `campaigns`, `campaign_steps`, `campaign_mailboxes`, `campaign_enrollments`, `scheduled_messages`, `suppressions`, and usage tables.
- [ ] Add unique `(campaign_enrollment_id,campaign_step_id)` and cross-workspace linkage protection.
- [ ] Add encrypted-secret fields and write-only mailbox API DTOs.
- [ ] Build mailbox form/verification status and limits: daily/hourly caps, delays, timezone, sending days/window, manual-reply reserve.
- [ ] Build six-step campaign wizard with strict variables, real-data preview, exclusions, capacity estimate, draft save, and launch confirmation.
- [ ] Write tests blocking unresolved placeholders, zero eligible leads, unavailable capacity, and unauthorized roles.

**Gate D output:** stable schemas and UI commands exist before any real mail is sent.

## Task 6: Worker Foundation and Zoho Connectivity — Thor

**Files:** `apps/worker/src/{config,db,queue,logger}.ts`, crypto and mailbox modules, worker tests, Dockerfile.

- [ ] Write failing tests for missing config, encryption round-trip/wrong key, log redaction, and graceful shutdown.
- [ ] Implement AES-256-GCM mailbox secret encryption with versioned key and per-record nonce.
- [ ] Bootstrap pg-boss, typed queues, heartbeat, dead-letter storage, and graceful SIGTERM.
- [ ] Implement Zoho SMTP/IMAP connection tests with regional host overrides.
- [ ] Classify auth, TLS/DNS, timeout, rate-limit, transient 4xx, and permanent 5xx errors without leaking credentials.
- [ ] Verify connectivity without sending a message unless explicitly requested.

## Task 7: Scheduling, Capacity, Rendering, and SMTP — Thor

- [ ] Write timezone/DST/weekend/midnight and concurrent-capacity failing tests.
- [ ] Atomically claim due jobs using `FOR UPDATE SKIP LOCKED` and reserve daily/hourly capacity in the assignment transaction.
- [ ] Prioritize manual replies and protect their reserve.
- [ ] Keep follow-ups on their original mailbox; pause when unavailable.
- [ ] Render immutable subject/body snapshots and reject unresolved variables.
- [ ] Create stable RFC Message-ID, threading headers, unsubscribe headers, and optional tracking pixel.
- [ ] Persist outbound intent before SMTP; append `smtp_accepted` only after Zoho acceptance.
- [ ] Retry transient failures; suppress hard bounces; mark crash-window ambiguity `delivery_unknown` without auto-resend.
- [ ] Verify duplicate job delivery cannot normally duplicate a sequence send or exceed limits.

## Task 8: Follow-ups, IMAP Sync, and Master Inbox — Thor server; Dave UI

- [ ] Write race tests for reply versus claimed follow-up, pause/resume/stop, suppression after queueing, and duplicate cancellations.
- [ ] Recheck every stop condition immediately before capacity claim/send.
- [ ] Implement incremental IMAP polling using UIDVALIDITY, UID cursor, and RFC Message-ID dedupe.
- [ ] Parse MIME/DSNs and conservatively classify human, OOO, hard/soft bounce, unsubscribe, or needs-review.
- [ ] Resolve threads using `In-Reply-To`, then `References`, then bounded participant-plus-subject fallback.
- [ ] Add `threads`, `messages`, `message_events`, sync state, and immutable original-message storage references.
- [ ] Build the three-column master inbox: filters/thread list, conversation, lead context.
- [ ] Reply from the receiving mailbox with correct thread headers; atomically stop follow-ups on human reply.
- [ ] Sanitize displayed HTML and block/proxy remote images.

**Gate E output:** all inboxes synchronize into one tenant-safe reply surface and event totals reconcile.

## Task 9: Tracking, Dashboard, and Safety Controls — Thor + Dave

- [ ] Implement versioned HMAC opaque tracking tokens and a route that always returns a no-store transparent GIF.
- [ ] Store raw loads separately from unique/estimated opens and editable bot/proxy classification.
- [ ] Add optional signed HTTPS-only click redirects with open-redirect tests.
- [ ] Build dashboard filters and KPIs: contacted, sent, accepted/delivery state, estimated opens, replies, positive replies, bounces, unsubscribes.
- [ ] Add daily chart, campaign table, mailbox health/utilization, funnel, sentiment, follow-up performance, import/enrichment status, and actionable warnings.
- [ ] Add hard-bounce/unsubscribe suppression and configurable bounce-rate safety pause.
- [ ] Verify dashboard aggregates equal canonical `messages` and `message_events` queries.

## Task 10: Deployment, Security, and Acceptance — All

**Files:** deployment compose/service definitions, operations runbooks, CI, acceptance tests.

- [ ] Add Hostinger worker deployment, health/readiness, restart policy, graceful timeout, logs, backups, queue recovery, and secret rotation runbooks.
- [ ] Add CI for lint, types, unit/integration/E2E, clean migration replay, SQL invariants, and production build.
- [ ] Stage with one mailbox and an allowlisted recipient list at very low volume.
- [ ] Soak-test worker restart during queues, IMAP reconnect, lease expiry, duplicate callbacks, and scheduler overlap.
- [ ] Roll out in order: mailbox connection, inbound sync, manual replies, low-volume initial sends, then follow-ups/tracking.
- [ ] Run a repository-wide HRMS-name/path scan and confirm no Warmailer runtime or migration reference exists.
- [ ] Complete tenant-adversarial and accessibility tests.

## Required SQL Invariants

```sql
-- Canonical LinkedIn URLs are unique inside a workspace.
select workspace_id, linkedin_url_normalized, count(*)
from all_leads_mmp
where linkedin_url_normalized is not null
group by 1,2 having count(*) > 1;

-- No sequence step exists twice.
select campaign_enrollment_id, campaign_step_id, count(*)
from scheduled_messages
group by 1,2 having count(*) > 1;

-- No cross-workspace mailbox/message linkage.
select m.id from messages m
join mailboxes mb on mb.id = m.mailbox_id
where m.workspace_id <> mb.workspace_id;

-- No queued work remains after a terminal enrollment state.
select sm.id from scheduled_messages sm
join campaign_enrollments ce on ce.id = sm.campaign_enrollment_id
where sm.status in ('queued','claimed')
and ce.status in ('replied','bounced','unsubscribed','stopped');

-- SMTP acceptance is canonical once per message.
select message_id, count(*) from message_events
where event_type = 'smtp_accepted'
group by message_id having count(*) > 1;
```

All invariant queries must return zero rows.

## Final Verification

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
supabase migration list --local
supabase db advisors
```

Final acceptance additionally requires a clean migration replay, zero invariant violations, zero cross-tenant access in adversarial tests, successful CSV re-import, correct primary/fallback billing behavior, no follow-up after reply, and a documented staging soak result.

## Connection Audit

1. Lead ownership must be deterministically backfilled before RLS; ambiguous rows are quarantined.
2. Only successful primary misses reach fallback; operational errors retry.
3. Fallback results match canonical LinkedIn URL, never ordering or name.
4. Scheduled step uniqueness plus transactional claims prevent duplicate normal-path sends.
5. Inbox, campaign history, and dashboard derive from canonical messages/events rather than competing counters.

Verdict: **SAFE**, provided every integration gate and invariant is enforced before the next phase.
