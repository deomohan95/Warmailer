create extension if not exists pgcrypto;

create schema if not exists private;

do $$
begin
  create type public.workspace_role as enum ('owner', 'admin', 'member');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.job_status as enum ('queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.email_status as enum ('not_enriched', 'queued', 'processing', 'found', 'not_found', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.enrichment_item_status as enum ('queued', 'leased', 'primary_running', 'fallback_queued', 'fallback_running', 'found', 'not_found', 'failed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role public.workspace_role not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
  );
$$;

create or replace function private.workspace_role_for(target_workspace_id uuid)
returns public.workspace_role
language sql
stable
security definer
set search_path = public
as $$
  select wm.role
  from public.workspace_members wm
  where wm.workspace_id = target_workspace_id
    and wm.user_id = (select auth.uid());
$$;

revoke execute on function private.is_workspace_member(uuid) from public, anon, authenticated, service_role;
revoke execute on function private.workspace_role_for(uuid) from public, anon, authenticated, service_role;

create table if not exists public.all_leads_mmp (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_file text,
  name text not null,
  job_title text,
  company text,
  link text,
  linkedin_url_normalized text,
  name_company_normalized text,
  location text,
  employees text,
  industry text,
  email text,
  email_status public.email_status not null default 'not_enriched',
  last_enriched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint all_leads_mmp_has_identity check (
    linkedin_url_normalized is not null
    or (name_company_normalized is not null and company is not null)
  ),
  constraint all_leads_mmp_found_has_email check (
    email_status <> 'found' or email is not null
  ),
  unique (id, workspace_id)
);

create unique index if not exists all_leads_mmp_workspace_linkedin_uidx
  on public.all_leads_mmp (workspace_id, linkedin_url_normalized)
  where linkedin_url_normalized is not null;

create unique index if not exists all_leads_mmp_workspace_name_company_uidx
  on public.all_leads_mmp (workspace_id, name_company_normalized)
  where linkedin_url_normalized is null and name_company_normalized is not null;

create index if not exists all_leads_mmp_workspace_email_status_idx
  on public.all_leads_mmp (workspace_id, email_status);

create table if not exists public.lead_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_file text not null,
  status public.job_status not null default 'queued',
  total_rows integer not null default 0 check (total_rows >= 0),
  accepted_rows integer not null default 0 check (accepted_rows >= 0),
  rejected_rows integer not null default 0 check (rejected_rows >= 0),
  inserted_rows integer not null default 0 check (inserted_rows >= 0),
  updated_rows integer not null default 0 check (updated_rows >= 0),
  error_message text,
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, workspace_id)
);

create table if not exists public.lead_import_rows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  import_id uuid not null,
  row_number integer not null check (row_number > 0),
  lead_id uuid,
  raw_data jsonb not null default '{}'::jsonb,
  normalized_data jsonb not null default '{}'::jsonb,
  action text not null check (action in ('inserted', 'updated', 'rejected', 'skipped')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  foreign key (import_id, workspace_id) references public.lead_imports(id, workspace_id) on delete cascade,
  foreign key (lead_id, workspace_id) references public.all_leads_mmp(id, workspace_id),
  unique (import_id, row_number)
);

create index if not exists workspace_members_user_workspace_idx
  on public.workspace_members (user_id, workspace_id);

create index if not exists lead_imports_workspace_status_idx
  on public.lead_imports (workspace_id, status);

create index if not exists lead_import_rows_workspace_import_idx
  on public.lead_import_rows (workspace_id, import_id);

create table if not exists public.enrichment_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status public.job_status not null default 'queued',
  selection jsonb not null,
  requested_by uuid,
  total_items integer not null default 0 check (total_items >= 0),
  found_items integer not null default 0 check (found_items >= 0),
  not_found_items integer not null default 0 check (not_found_items >= 0),
  failed_items integer not null default 0 check (failed_items >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, workspace_id)
);

create table if not exists public.enrichment_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  batch_id uuid not null,
  lead_id uuid not null,
  status public.enrichment_item_status not null default 'queued',
  linkedin_url_normalized text not null,
  primary_attempts integer not null default 0 check (primary_attempts >= 0),
  fallback_attempts integer not null default 0 check (fallback_attempts >= 0),
  leased_until timestamptz,
  last_error text,
  email_found text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (batch_id, workspace_id) references public.enrichment_batches(id, workspace_id) on delete cascade,
  foreign key (lead_id, workspace_id) references public.all_leads_mmp(id, workspace_id) on delete cascade,
  unique (batch_id, lead_id)
);

create index if not exists enrichment_batches_workspace_status_idx
  on public.enrichment_batches (workspace_id, status);

create index if not exists enrichment_items_workspace_status_lease_idx
  on public.enrichment_items (workspace_id, status, leased_until);

create index if not exists enrichment_items_workspace_lead_idx
  on public.enrichment_items (workspace_id, lead_id);

create table if not exists public.apify_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  enrichment_item_id uuid references public.enrichment_items(id) on delete cascade,
  actor_id text not null,
  apify_run_id text not null,
  phase text not null check (phase in ('primary', 'fallback')),
  input jsonb not null,
  status text not null default 'created',
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (apify_run_id)
);

create index if not exists apify_runs_workspace_item_idx
  on public.apify_runs (workspace_id, enrichment_item_id);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.all_leads_mmp enable row level security;
alter table public.lead_imports enable row level security;
alter table public.lead_import_rows enable row level security;
alter table public.enrichment_batches enable row level security;
alter table public.enrichment_items enable row level security;
alter table public.apify_runs enable row level security;

grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_members to authenticated;
grant select, insert, update, delete on public.all_leads_mmp to authenticated;
grant select, insert, update, delete on public.lead_imports to authenticated;
grant select, insert, update, delete on public.lead_import_rows to authenticated;
grant select, insert, update, delete on public.enrichment_batches to authenticated;
grant select, insert, update, delete on public.enrichment_items to authenticated;
grant select, insert, update, delete on public.apify_runs to authenticated;

drop policy if exists "workspace members can view workspaces" on public.workspaces;
create policy "workspace members can view workspaces"
on public.workspaces for select
to authenticated
using (private.is_workspace_member(id));

drop policy if exists "workspace members can view memberships" on public.workspace_members;
create policy "workspace members can view memberships"
on public.workspace_members for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "owners can manage memberships" on public.workspace_members;
create policy "owners can manage memberships"
on public.workspace_members for all
to authenticated
using (private.workspace_role_for(workspace_id) = 'owner')
with check (private.workspace_role_for(workspace_id) = 'owner');

drop policy if exists "members can view leads" on public.all_leads_mmp;
create policy "members can view leads"
on public.all_leads_mmp for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "admins can insert leads" on public.all_leads_mmp;
create policy "admins can insert leads"
on public.all_leads_mmp for insert
to authenticated
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

drop policy if exists "admins can update leads" on public.all_leads_mmp;
create policy "admins can update leads"
on public.all_leads_mmp for update
to authenticated
using (private.workspace_role_for(workspace_id) in ('owner', 'admin'))
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

drop policy if exists "members can view imports" on public.lead_imports;
create policy "members can view imports"
on public.lead_imports for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "admins can manage imports" on public.lead_imports;
create policy "admins can manage imports"
on public.lead_imports for all
to authenticated
using (private.workspace_role_for(workspace_id) in ('owner', 'admin'))
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

drop policy if exists "members can view import rows" on public.lead_import_rows;
create policy "members can view import rows"
on public.lead_import_rows for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "admins can manage import rows" on public.lead_import_rows;
create policy "admins can manage import rows"
on public.lead_import_rows for all
to authenticated
using (private.workspace_role_for(workspace_id) in ('owner', 'admin'))
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

drop policy if exists "members can view enrichment batches" on public.enrichment_batches;
create policy "members can view enrichment batches"
on public.enrichment_batches for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "admins can manage enrichment batches" on public.enrichment_batches;
create policy "admins can manage enrichment batches"
on public.enrichment_batches for all
to authenticated
using (private.workspace_role_for(workspace_id) in ('owner', 'admin'))
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

drop policy if exists "members can view enrichment items" on public.enrichment_items;
create policy "members can view enrichment items"
on public.enrichment_items for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "admins can manage enrichment items" on public.enrichment_items;
create policy "admins can manage enrichment items"
on public.enrichment_items for all
to authenticated
using (private.workspace_role_for(workspace_id) in ('owner', 'admin'))
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

drop policy if exists "members can view apify runs" on public.apify_runs;
create policy "members can view apify runs"
on public.apify_runs for select
to authenticated
using (private.is_workspace_member(workspace_id));
