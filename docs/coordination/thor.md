# Thor coordination notes

Thor owns the isolated mail worker under `apps/worker`.

## Root dependency requests

- None for the foundation slice. It uses Node.js 22 built-ins and its own package manifest.
- Later worker slices will need `pg-boss`, `pg`, `nodemailer`, `imapflow`, `mailparser`, `zod`, and `pino`. Add these only to `apps/worker/package.json`; do not add them to the root manifest.

## Coordination needs

- Thor worktree is available at `C:\Users\admin\Desktop\Warmailer-thor` on branch `feat/mail-worker`.
- Root owns integration, commits, checkpoints, remote configuration, and pushes. Thor does not push directly.
- Gate A still owns root manifests, shared contracts, and lockfiles. Thor should keep foundation work under `apps/worker/` until the integrator freezes shared contracts.
- Queue and database dependencies remain deferred until root/integrator approves dependency changes.
- Mocked Zoho connectivity classification now exists using Node.js built-ins only. Real SMTP/IMAP adapters still require `nodemailer` and `imapflow` in `apps/worker/package.json`.

## Safety boundary

- Tests use deterministic in-memory values only.
- No SMTP, IMAP, Supabase, Apify, or other network connection is made by this slice.
- Zoho connectivity tests use injected mock connectors only; no message is sent.
- No environment file is read by tests or production modules; callers must explicitly pass an environment object to `loadConfig`.
