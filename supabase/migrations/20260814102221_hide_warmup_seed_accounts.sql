drop policy if exists "members can view warmup seeds" on public.warmup_seed_accounts;
drop policy if exists "admins can manage warmup seeds" on public.warmup_seed_accounts;

revoke select, insert, update, delete on public.warmup_seed_accounts from authenticated;
revoke all on public.warmup_seed_accounts from anon;
