create table if not exists public.company_email_patterns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  company_key text not null,
  company_name_sample text,
  domain text not null,
  pattern text not null check (pattern in ('first.last', 'flast', 'firstl', 'firstlast')),
  verified_count integer not null default 0 check (verified_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, company_key, domain, pattern)
);

create index if not exists company_email_patterns_workspace_company_idx
  on public.company_email_patterns (workspace_id, company_key);

alter table public.company_email_patterns enable row level security;

grant select, insert, update, delete on public.company_email_patterns to authenticated;

drop policy if exists "members can view company email patterns" on public.company_email_patterns;
create policy "members can view company email patterns"
on public.company_email_patterns for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "admins can manage company email patterns" on public.company_email_patterns;
create policy "admins can manage company email patterns"
on public.company_email_patterns for all
to authenticated
using (private.workspace_role_for(workspace_id) in ('owner', 'admin'))
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));
