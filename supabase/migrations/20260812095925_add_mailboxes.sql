do $$
begin
  create type public.mailbox_status as enum ('not_connected', 'connected', 'warming', 'sending_paused', 'error');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.mailbox_event_type as enum ('connected', 'connection_failed', 'limits_updated', 'paused', 'resumed', 'usage_reserved', 'usage_consumed', 'sync_checked');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email_address text not null,
  display_name text not null,
  status public.mailbox_status not null default 'connected',
  zoho_region text not null default 'us' check (zoho_region in ('us', 'eu', 'in', 'au')),
  smtp_host text,
  smtp_port integer not null default 465 check (smtp_port > 0),
  imap_host text,
  imap_port integer not null default 993 check (imap_port > 0),
  encrypted_app_password jsonb not null,
  app_password_configured boolean not null default true,
  daily_hard_limit integer not null check (daily_hard_limit > 0 and daily_hard_limit <= 500),
  hourly_hard_limit integer not null check (hourly_hard_limit > 0 and hourly_hard_limit <= 100),
  sending_window_start time not null,
  sending_window_end time not null,
  timezone text not null default 'UTC',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mailboxes_window_order check (sending_window_start < sending_window_end),
  unique (id, workspace_id)
);

create unique index if not exists mailboxes_workspace_email_uidx
  on public.mailboxes (workspace_id, lower(email_address));

create index if not exists mailboxes_workspace_status_idx
  on public.mailboxes (workspace_id, status);

create table if not exists public.mailbox_daily_usage (
  workspace_id uuid not null,
  mailbox_id uuid not null,
  usage_date date not null,
  used_count integer not null default 0 check (used_count >= 0),
  reserved_count integer not null default 0 check (reserved_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, mailbox_id, usage_date),
  foreign key (mailbox_id, workspace_id) references public.mailboxes(id, workspace_id) on delete cascade
);

create index if not exists mailbox_daily_usage_workspace_date_idx
  on public.mailbox_daily_usage (workspace_id, usage_date);

create table if not exists public.mailbox_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  mailbox_id uuid not null,
  event_type public.mailbox_event_type not null,
  source text not null check (source in ('zoho_mail', 'user_action', 'system')),
  actor_user_id uuid,
  message_id uuid,
  campaign_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (mailbox_id, workspace_id) references public.mailboxes(id, workspace_id) on delete cascade
);

create index if not exists mailbox_events_workspace_mailbox_idx
  on public.mailbox_events (workspace_id, mailbox_id, created_at desc);

create or replace view public.mailbox_capacity
with (security_invoker = true)
as
select
  m.id as mailbox_id,
  m.workspace_id,
  m.email_address,
  m.display_name,
  m.status,
  m.daily_hard_limit,
  m.hourly_hard_limit,
  coalesce(u.used_count, 0) as used_today,
  coalesce(u.reserved_count, 0) as reserved_today,
  greatest(0, m.daily_hard_limit - coalesce(u.used_count, 0) - coalesce(u.reserved_count, 0)) as available_today,
  m.sending_window_start,
  m.sending_window_end,
  m.timezone,
  m.app_password_configured,
  m.created_at,
  m.updated_at
from public.mailboxes m
left join public.mailbox_daily_usage u
  on u.workspace_id = m.workspace_id
 and u.mailbox_id = m.id
 and u.usage_date = ((now() at time zone m.timezone)::date);

alter table public.mailboxes enable row level security;
alter table public.mailbox_daily_usage enable row level security;
alter table public.mailbox_events enable row level security;

grant select, insert, update on public.mailboxes to authenticated;
grant select on public.mailbox_daily_usage to authenticated;
grant select on public.mailbox_events to authenticated;
grant select on public.mailbox_capacity to authenticated;

drop policy if exists "members can view mailboxes" on public.mailboxes;
create policy "members can view mailboxes"
on public.mailboxes for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "admins can insert mailboxes" on public.mailboxes;
create policy "admins can insert mailboxes"
on public.mailboxes for insert
to authenticated
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

drop policy if exists "admins can update mailboxes" on public.mailboxes;
create policy "admins can update mailboxes"
on public.mailboxes for update
to authenticated
using (private.workspace_role_for(workspace_id) in ('owner', 'admin'))
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

drop policy if exists "members can view mailbox usage" on public.mailbox_daily_usage;
create policy "members can view mailbox usage"
on public.mailbox_daily_usage for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "members can view mailbox events" on public.mailbox_events;
create policy "members can view mailbox events"
on public.mailbox_events for select
to authenticated
using (private.is_workspace_member(workspace_id));
