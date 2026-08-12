# Thor coordination notes

Thor owns the isolated mail worker under `apps/worker`.

## Root dependency requests

- None for the foundation slice. It uses Node.js 22 built-ins and its own package manifest.
- Later worker slices will need `pg-boss`, `pg`, `nodemailer`, `imapflow`, `mailparser`, `zod`, and `pino`. Add these only to `apps/worker/package.json`; do not add them to the root manifest.

## Coordination needs

- Thor worktree creation is blocked until the repository has a committed baseline HEAD. Current checkout reports `master` with an all-zero HEAD, so `feat/mail-worker` cannot be created safely yet.
- Gate A still owns root manifests, shared contracts, and lockfiles. Thor should keep foundation work under `apps/worker/` until the integrator freezes shared contracts.
- Queue, database, and real Zoho connectivity are intentionally deferred. This slice only adds local config parsing, mailbox secret encryption, and redacted logging tests/implementation.

## Safety boundary

- Tests use deterministic in-memory values only.
- No SMTP, IMAP, Supabase, Apify, or other network connection is made by this slice.
- No environment file is read by tests or production modules; callers must explicitly pass an environment object to `loadConfig`.
