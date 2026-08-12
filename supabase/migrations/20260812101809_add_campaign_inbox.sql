do $$
begin
  create type public.campaign_status as enum ('draft', 'scheduled', 'sending', 'paused', 'completed', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.campaign_lead_status as enum ('selected', 'queued', 'sent', 'replied', 'bounced', 'skipped');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.campaign_event_type as enum ('scheduled', 'paused', 'resumed', 'stopped');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.thread_status as enum ('unread', 'read', 'replied', 'archived');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.message_direction as enum ('inbound', 'outbound');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.message_event_type as enum (
    'queued',
    'smtp_accepted',
    'delivery_unknown',
    'open',
    'click',
    'reply',
    'bounce',
    'unsubscribe',
    'failed',
    'suppressed'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  status public.campaign_status not null default 'draft',
  timezone text not null default 'UTC',
  start_date date,
  sending_days smallint[] not null default '{}'::smallint[],
  sending_window_start time not null default '09:00',
  sending_window_end time not null default '17:00',
  per_mailbox_delay_seconds integer not null default 120 check (per_mailbox_delay_seconds >= 0),
  max_sends_per_day integer not null default 1 check (max_sends_per_day > 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz,
  constraint campaigns_window_order check (sending_window_start < sending_window_end),
  constraint campaigns_sending_days_valid check (
    array_length(sending_days, 1) is null
    or sending_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  unique (id, workspace_id)
);

create index if not exists campaigns_workspace_status_idx
  on public.campaigns (workspace_id, status, updated_at desc);

create table if not exists public.campaign_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  step_order integer not null check (step_order >= 0),
  subject text not null default '',
  body text not null,
  delay_days integer not null default 0 check (delay_days >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, workspace_id) references public.campaigns(id, workspace_id) on delete cascade,
  unique (campaign_id, step_order)
);

create table if not exists public.campaign_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  lead_id uuid not null,
  status public.campaign_lead_status not null default 'selected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (campaign_id, workspace_id) references public.campaigns(id, workspace_id) on delete cascade,
  foreign key (lead_id, workspace_id) references public.all_leads_mmp(id, workspace_id) on delete cascade,
  unique (campaign_id, lead_id)
);

create index if not exists campaign_leads_workspace_campaign_idx
  on public.campaign_leads (workspace_id, campaign_id);

create index if not exists campaign_leads_workspace_lead_idx
  on public.campaign_leads (workspace_id, lead_id);

create table if not exists public.campaign_mailboxes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  mailbox_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (campaign_id, workspace_id) references public.campaigns(id, workspace_id) on delete cascade,
  foreign key (mailbox_id, workspace_id) references public.mailboxes(id, workspace_id) on delete cascade,
  unique (campaign_id, mailbox_id)
);

create index if not exists campaign_mailboxes_workspace_campaign_idx
  on public.campaign_mailboxes (workspace_id, campaign_id);

create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  campaign_id uuid not null,
  event_type public.campaign_event_type not null,
  source text not null check (source in ('user_action', 'system')),
  actor_user_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (campaign_id, workspace_id) references public.campaigns(id, workspace_id) on delete cascade
);

create index if not exists campaign_events_workspace_campaign_idx
  on public.campaign_events (workspace_id, campaign_id, created_at desc);

create table if not exists public.inbox_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  mailbox_id uuid not null,
  lead_id uuid,
  campaign_id uuid,
  provider_thread_id text,
  from_email text not null,
  subject text not null default '',
  status public.thread_status not null default 'unread',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (mailbox_id, workspace_id) references public.mailboxes(id, workspace_id) on delete cascade,
  foreign key (lead_id, workspace_id) references public.all_leads_mmp(id, workspace_id),
  foreign key (campaign_id, workspace_id) references public.campaigns(id, workspace_id),
  unique (id, workspace_id)
);

create unique index if not exists inbox_threads_workspace_mailbox_provider_uidx
  on public.inbox_threads (workspace_id, mailbox_id, provider_thread_id)
  where provider_thread_id is not null;

create index if not exists inbox_threads_workspace_status_idx
  on public.inbox_threads (workspace_id, status, last_message_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  thread_id uuid,
  campaign_id uuid,
  lead_id uuid,
  mailbox_id uuid not null,
  direction public.message_direction not null,
  provider_message_id text,
  subject text not null default '',
  body_text text not null default '',
  body_preview text not null default '',
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (thread_id, workspace_id) references public.inbox_threads(id, workspace_id),
  foreign key (campaign_id, workspace_id) references public.campaigns(id, workspace_id),
  foreign key (lead_id, workspace_id) references public.all_leads_mmp(id, workspace_id),
  foreign key (mailbox_id, workspace_id) references public.mailboxes(id, workspace_id) on delete cascade,
  unique (id, workspace_id)
);

create unique index if not exists messages_workspace_mailbox_provider_uidx
  on public.messages (workspace_id, mailbox_id, provider_message_id)
  where provider_message_id is not null;

create index if not exists messages_workspace_campaign_idx
  on public.messages (workspace_id, campaign_id, created_at desc);

create index if not exists messages_workspace_thread_idx
  on public.messages (workspace_id, thread_id, created_at);

create table if not exists public.message_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  message_id uuid not null,
  event_type public.message_event_type not null,
  source text not null check (source in ('zoho_mail', 'user_action', 'system')),
  provider_event_id text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (message_id, workspace_id) references public.messages(id, workspace_id) on delete cascade
);

create unique index if not exists message_events_workspace_provider_uidx
  on public.message_events (workspace_id, provider_event_id)
  where provider_event_id is not null;

create index if not exists message_events_workspace_message_idx
  on public.message_events (workspace_id, message_id, occurred_at desc);

create or replace view public.campaign_list
with (security_invoker = true)
as
select
  c.id as campaign_id,
  c.workspace_id,
  c.name,
  c.status,
  coalesce(cl.selected_lead_count, 0) as selected_lead_count,
  coalesce(cm.selected_mailbox_count, 0) as selected_mailbox_count,
  coalesce(cm.daily_capacity, 0) as daily_capacity,
  greatest(
    coalesce(c.last_activity_at, c.updated_at),
    coalesce(activity.last_activity_at, c.updated_at)
  ) as last_activity_at,
  c.created_at,
  c.updated_at
from public.campaigns c
left join (
  select workspace_id, campaign_id, count(*) as selected_lead_count
  from public.campaign_leads
  group by workspace_id, campaign_id
) cl
  on cl.workspace_id = c.workspace_id
 and cl.campaign_id = c.id
left join (
  select
    cm.workspace_id,
    cm.campaign_id,
    count(*) as selected_mailbox_count,
    coalesce(sum(mc.available_today) filter (where mc.status = 'connected'), 0) as daily_capacity
  from public.campaign_mailboxes cm
  left join public.mailbox_capacity mc
    on mc.workspace_id = cm.workspace_id
   and mc.mailbox_id = cm.mailbox_id
  group by cm.workspace_id, cm.campaign_id
) cm
  on cm.workspace_id = c.workspace_id
 and cm.campaign_id = c.id
left join (
  select m.workspace_id, m.campaign_id, max(me.occurred_at) as last_activity_at
  from public.messages m
  join public.message_events me
    on me.workspace_id = m.workspace_id
   and me.message_id = m.id
  where m.campaign_id is not null
  group by m.workspace_id, m.campaign_id
) activity
  on activity.workspace_id = c.workspace_id
 and activity.campaign_id = c.id;

create or replace view public.campaign_detail
with (security_invoker = true)
as
select
  c.id as campaign_id,
  c.workspace_id,
  c.name,
  c.status,
  c.timezone,
  c.start_date,
  c.sending_days,
  c.sending_window_start,
  c.sending_window_end,
  c.per_mailbox_delay_seconds,
  c.max_sends_per_day,
  c.created_at,
  c.updated_at,
  c.last_activity_at
from public.campaigns c;

create or replace view public.campaign_activity
with (security_invoker = true)
as
select
  me.id as entity_id,
  me.workspace_id,
  m.campaign_id,
  m.lead_id,
  m.mailbox_id,
  me.message_id,
  me.event_type::text as event_type,
  me.occurred_at,
  me.source,
  me.created_at,
  me.created_at as updated_at
from public.message_events me
join public.messages m
  on m.workspace_id = me.workspace_id
 and m.id = me.message_id
where m.campaign_id is not null
union all
select
  ce.id as entity_id,
  ce.workspace_id,
  ce.campaign_id,
  null::uuid as lead_id,
  null::uuid as mailbox_id,
  null::uuid as message_id,
  ce.event_type::text as event_type,
  ce.created_at as occurred_at,
  ce.source,
  ce.created_at,
  ce.created_at as updated_at
from public.campaign_events ce;

create or replace view public.inbox_thread_list
with (security_invoker = true)
as
select
  t.id as thread_id,
  t.workspace_id,
  t.mailbox_id,
  t.lead_id,
  t.campaign_id,
  latest.id as message_id,
  t.from_email,
  t.subject,
  t.last_message_at,
  t.status,
  coalesce(latest.body_preview, '') as preview,
  t.created_at,
  t.updated_at
from public.inbox_threads t
left join lateral (
  select m.id, m.body_preview
  from public.messages m
  where m.workspace_id = t.workspace_id
    and m.thread_id = t.id
  order by coalesce(m.received_at, m.sent_at, m.created_at) desc
  limit 1
) latest on true;

create or replace view public.inbox_thread_messages
with (security_invoker = true)
as
select
  m.id as message_id,
  m.workspace_id,
  m.thread_id,
  m.campaign_id,
  m.lead_id,
  m.mailbox_id,
  m.direction,
  m.subject,
  m.body_text,
  m.body_preview,
  m.sent_at,
  m.received_at,
  m.created_at
from public.messages m
where m.thread_id is not null;

create or replace view public.dashboard_overview
with (security_invoker = true)
as
with campaign_counts as (
  select
    workspace_id,
    count(*) filter (where status in ('scheduled', 'sending')) as active_campaign_count,
    max(updated_at) as updated_at
  from public.campaigns
  group by workspace_id
),
inbox_counts as (
  select
    workspace_id,
    count(*) filter (where status = 'unread') as unread_thread_count,
    max(updated_at) as updated_at
  from public.inbox_threads
  group by workspace_id
)
select
  w.id as workspace_id,
  coalesce(lr.imported_count, 0) as imported_count,
  coalesce(lr.email_found_count, 0) as email_found_count,
  coalesce(lr.enrichment_eligible_count, 0) as enrichment_eligible_count,
  count(mc.mailbox_id) filter (where mc.status = 'connected') as connected_mailbox_count,
  coalesce(sum(mc.available_today) filter (where mc.status = 'connected'), 0) as send_capacity_today,
  coalesce(cc.active_campaign_count, 0) as active_campaign_count,
  coalesce(ic.unread_thread_count, 0) as unread_thread_count,
  greatest(
    coalesce(lr.updated_at, w.updated_at),
    coalesce(max(mc.updated_at), w.updated_at),
    coalesce(cc.updated_at, w.updated_at),
    coalesce(ic.updated_at, w.updated_at)
  ) as updated_at
from public.workspaces w
left join public.lead_readiness lr
  on lr.workspace_id = w.id
left join public.mailbox_capacity mc
  on mc.workspace_id = w.id
left join campaign_counts cc
  on cc.workspace_id = w.id
left join inbox_counts ic
  on ic.workspace_id = w.id
group by
  w.id,
  w.updated_at,
  lr.imported_count,
  lr.email_found_count,
  lr.enrichment_eligible_count,
  lr.updated_at,
  cc.active_campaign_count,
  cc.updated_at,
  ic.unread_thread_count,
  ic.updated_at;

alter table public.campaigns enable row level security;
alter table public.campaign_sequence_steps enable row level security;
alter table public.campaign_leads enable row level security;
alter table public.campaign_mailboxes enable row level security;
alter table public.campaign_events enable row level security;
alter table public.inbox_threads enable row level security;
alter table public.messages enable row level security;
alter table public.message_events enable row level security;

grant select, insert, update on public.campaigns to authenticated;
grant select, insert, update, delete on public.campaign_sequence_steps to authenticated;
grant select, insert, update, delete on public.campaign_leads to authenticated;
grant select, insert, delete on public.campaign_mailboxes to authenticated;
grant select on public.campaign_events to authenticated;
grant select on public.inbox_threads to authenticated;
grant select on public.messages to authenticated;
grant select on public.message_events to authenticated;
grant select on public.campaign_list to authenticated;
grant select on public.campaign_detail to authenticated;
grant select on public.campaign_activity to authenticated;
grant select on public.inbox_thread_list to authenticated;
grant select on public.inbox_thread_messages to authenticated;
grant select on public.dashboard_overview to authenticated;

drop policy if exists "members can view campaigns" on public.campaigns;
create policy "members can view campaigns"
on public.campaigns for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "admins can insert campaigns" on public.campaigns;
create policy "admins can insert campaigns"
on public.campaigns for insert
to authenticated
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

drop policy if exists "admins can update campaigns" on public.campaigns;
create policy "admins can update campaigns"
on public.campaigns for update
to authenticated
using (private.workspace_role_for(workspace_id) in ('owner', 'admin'))
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

drop policy if exists "members can view campaign sequence steps" on public.campaign_sequence_steps;
create policy "members can view campaign sequence steps"
on public.campaign_sequence_steps for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "admins can manage campaign sequence steps" on public.campaign_sequence_steps;
create policy "admins can manage campaign sequence steps"
on public.campaign_sequence_steps for all
to authenticated
using (private.workspace_role_for(workspace_id) in ('owner', 'admin'))
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

drop policy if exists "members can view campaign leads" on public.campaign_leads;
create policy "members can view campaign leads"
on public.campaign_leads for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "admins can manage campaign leads" on public.campaign_leads;
create policy "admins can manage campaign leads"
on public.campaign_leads for all
to authenticated
using (private.workspace_role_for(workspace_id) in ('owner', 'admin'))
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

drop policy if exists "members can view campaign mailboxes" on public.campaign_mailboxes;
create policy "members can view campaign mailboxes"
on public.campaign_mailboxes for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "admins can manage campaign mailboxes" on public.campaign_mailboxes;
create policy "admins can manage campaign mailboxes"
on public.campaign_mailboxes for all
to authenticated
using (private.workspace_role_for(workspace_id) in ('owner', 'admin'))
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

drop policy if exists "members can view campaign events" on public.campaign_events;
create policy "members can view campaign events"
on public.campaign_events for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "members can view inbox threads" on public.inbox_threads;
create policy "members can view inbox threads"
on public.inbox_threads for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "members can view messages" on public.messages;
create policy "members can view messages"
on public.messages for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "members can view message events" on public.message_events;
create policy "members can view message events"
on public.message_events for select
to authenticated
using (private.is_workspace_member(workspace_id));
