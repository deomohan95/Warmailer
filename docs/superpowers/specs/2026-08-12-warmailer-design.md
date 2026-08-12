# Warmailer Product Design

## Purpose

Warmailer is a multi-tenant outbound email platform for internal use and later resale. It imports Apollo CSV exports into Supabase, enriches selected leads through Apify, runs scheduled Zoho campaigns and follow-ups, synchronizes all replies into a master inbox, and reports campaign and mailbox performance.

Lead scraping is external. HRMS data is a separate project and is never queried, migrated, granted, triggered, imported, or backfilled by Warmailer.

## Architecture

- Next.js App Router web application for authentication, workspaces, dashboard, leads, campaigns, inbox, and settings.
- Supabase Auth and Postgres with `workspace_id` on every tenant-owned row and RLS on every exposed table.
- A Node.js worker on Hostinger for CSV processing, Apify orchestration, scheduled delivery, follow-ups, IMAP synchronization, retries, and health monitoring.
- PostgreSQL-backed jobs using `pg-boss`; no Redis is required initially.
- Zoho SMTP/IMAP with app passwords encrypted using AES-256-GCM. Secrets are never returned to the browser.
- `all_leads_mmp` is the only mutable source of truth for MMP leads and resolved email state.
- Canonical `messages` plus append-only `message_events` are the source of truth for dashboard, campaign history, and master inbox.

## Tenancy and Roles

Each customer has a workspace. Users may belong to multiple workspaces.

- Owner: billing-ready workspace control, team, mailbox credentials, and all operations.
- Admin: leads, imports, enrichment, campaigns, inbox, reporting, and mailbox operations.
- Member: leads, campaigns, inbox, and replies; no credential or team administration.

Authorization comes from `workspace_members`, not user-editable JWT metadata. Browser queries use RLS. Trusted worker operations use the service key but must explicitly validate `workspace_id` on every repository operation.

## Lead Import and Deduplication

Accepted canonical CSV headers are:

```text
source_file,name,job_title,company,link,location,employees,industry
```

The parser streams files, tolerates BOM/whitespace and reordered headers, warns on unknown columns, and rejects missing canonical columns. A usable row needs `name` and either a valid LinkedIn profile URL or a non-empty company.

Deduplication is workspace-scoped:

1. Canonical LinkedIn URL is the primary identity.
2. Normalized `name + company` is used only when LinkedIn is absent.
3. Different LinkedIn URLs are never merged because names happen to match.
4. Re-imports refresh non-empty profile fields but never erase a known email.

Imports retain row-level validation and action results so retries are idempotent and rejected rows can be downloaded.

## Bulk Email Enrichment

Users select rows, a page, or all filtered eligible leads and press **Bulk Find Emails**. Existing-email and already-running leads are skipped.

Primary actor:

- `snipercoder/linkedin-email-finder`
- Actor ID `UMdANQyqx3b2JVuxg`
- One run per lead with `{ "linkedin": "<canonical-url>" }`

Fallback actor:

- `x_guru/linkedin-email-Scraper-no-cookies`
- Actor ID `q3wko0Sbx6ZAAB2xf`
- Bounded bulk runs with `{ "linkedinUrls": ["<canonical-url>"] }`

Only a successfully completed primary run with no email enters fallback. Timeouts, rate limits, malformed output, and transport failures retry and never masquerade as `not_found`. Fallback results are matched by canonical LinkedIn URL, never array position or name.

## Campaigns and Delivery

The campaign wizard contains details, lead selection, mailbox selection, sequence, schedule, and review. It supports strict variables such as `{{first_name}}`, `{{job_title}}`, `{{company}}`, and sender fields. Unresolved variables block launch.

Each mailbox has daily/hourly hard limits, randomized delay bounds, sending days/windows, timezone, reply reserve, connection health, and campaign/warmup enablement. Initial messages rotate across eligible mailboxes. Follow-ups remain on the original mailbox; if it becomes unavailable, the sequence pauses for operator action.

Stop conditions are checked when scheduling and immediately before sending. Replies, hard bounces, unsubscribes, suppression, campaign stop, and manual stop cancel pending follow-ups. Out-of-office replies pause until a confidently detected return date or manual resume.

SMTP acceptance means `sent`, not proven delivery. If a worker dies after Zoho accepts a message but before acknowledgement, the message becomes `delivery_unknown` and is not automatically resent.

## Master Inbox

The inbox combines every connected Zoho mailbox in the active workspace. It includes thread filters, unread/needs-reply state, campaign attribution, reply sentiment/category, assignment, and a lead context panel.

Thread resolution uses `In-Reply-To`, then `References`, then bounded participant-plus-subject fallback. It never threads solely by subject. Replies are sent from the mailbox that received the conversation. A human reply atomically stops pending follow-ups.

IMAP polling tracks UIDVALIDITY and last UID, deduplicates with RFC Message-ID, parses MIME and delivery-status reports, and conservatively classifies human reply, out-of-office, bounce, unsubscribe, or needs review.

## Dashboard

Filters include date range, workspace/client, campaign, mailbox, import/source, and timezone.

Primary KPIs:

- Leads contacted
- Emails sent
- Delivered/accepted-state breakdown
- Estimated unique opens
- Replies and reply rate
- Positive replies
- Bounces and bounce rate
- Unsubscribes

Supporting panels include a daily performance chart, campaign table, mailbox health and utilization, lead funnel, reply sentiment, follow-up performance, import/enrichment progress, and actionable warnings.

## Tracking

Open tracking uses a signed opaque token in a 1x1 image. Raw pixel loads and derived unique/estimated opens are stored separately. Proxy/bot heuristics never overwrite raw events. The UI labels the metric **Estimated open rate** because privacy protection, image blocking, caching, and security scanners make opens approximate.

Click tracking is optional and uses signed HTTPS-only redirects. Reply, bounce, unsubscribe, and positive-reply rates are the primary business metrics.

## Safety and Security

- RLS on every exposed tenant table; cross-workspace foreign references are rejected.
- Service role, Apify token, encryption key, and mailbox passwords are server-only.
- Mailbox app passwords are write-only in the UI and encrypted at rest.
- Hard bounces and unsubscribes create workspace suppressions.
- High bounce rate safety-pauses campaigns after a configurable minimum sample.
- Email HTML displayed in Warmailer is sanitized and remote images are blocked/proxied.
- Logs redact credentials, tokens, authorization headers, bodies, and sensitive payloads.
- Warmup is a separate later module after campaign delivery is stable.

## Delivery Phases

1. Foundation: repository, app shell, Auth, workspaces, schema, RLS, worker foundation.
2. Leads: CSV import, review, deduplication, bulk enrichment.
3. Mailboxes and campaigns: connection testing, campaign builder, scheduling, safe SMTP delivery.
4. Inbox and follow-ups: IMAP sync, threading, replies, cancellation rules.
5. Reporting and hardening: tracking, dashboard, alerts, deployment, soak testing.
6. Later: warmup engine, Gmail participation, deliverability scoring, and commercial billing.

## Acceptance Criteria

- A tenant cannot access another tenant through UI, REST, crafted IDs, or related rows.
- An Apollo CSV can be imported twice without duplicate leads or lost email data.
- Selected/all-filtered enrichment runs primary per URL and fallback only for true misses.
- Concurrent workers never exceed mailbox hard limits or normally send a sequence step twice.
- Replies from every mailbox appear once in the master inbox and stop pending follow-ups.
- Dashboard totals reconcile to canonical message/event rows.
- No Warmailer migration or runtime path touches HRMS.

