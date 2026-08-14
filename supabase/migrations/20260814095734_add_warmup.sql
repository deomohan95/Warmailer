alter table public.mailboxes
  add column if not exists warmup_enabled boolean not null default false,
  add column if not exists warmup_daily_limit integer not null default 25 check (warmup_daily_limit between 1 and 100),
  add column if not exists warmup_daily_rampup integer not null default 5 check (warmup_daily_rampup between 1 and 100),
  add column if not exists warmup_randomize_daily_count boolean not null default true,
  add column if not exists warmup_reply_rate_percent integer not null default 20 check (warmup_reply_rate_percent between 0 and 100),
  add column if not exists warmup_started_at timestamptz;

do $$
begin
  create type public.warmup_seed_status as enum ('connected', 'disabled', 'error');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.warmup_message_status as enum ('scheduled', 'claimed', 'sent', 'landed_inbox', 'saved_from_spam', 'replied', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.warmup_event_type as enum ('scheduled', 'claimed', 'sent', 'landed_inbox', 'landed_spam', 'saved_from_spam', 'marked_important', 'reply_sent', 'failed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.warmup_seed_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'gmail' check (provider = 'gmail'),
  email_address text not null,
  composio_user_id text not null,
  composio_connected_account_id text not null,
  status public.warmup_seed_status not null default 'connected',
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, lower(email_address)),
  unique (workspace_id, composio_connected_account_id)
);

create table if not exists public.warmup_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  mailbox_id uuid not null,
  seed_account_id uuid not null,
  direction text not null default 'mailbox_to_seed' check (direction = 'mailbox_to_seed'),
  token text not null,
  subject text not null,
  body_text text not null,
  status public.warmup_message_status not null default 'scheduled',
  scheduled_for timestamptz not null,
  claimed_at timestamptz,
  sent_at timestamptz,
  sender_provider_message_id text,
  seed_provider_message_id text,
  seed_thread_id text,
  landed_folder text check (landed_folder in ('inbox', 'spam')),
  rescued_at timestamptz,
  marked_important_at timestamptz,
  replied_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, token),
  foreign key (mailbox_id, workspace_id) references public.mailboxes(id, workspace_id) on delete cascade,
  foreign key (seed_account_id, workspace_id) references public.warmup_seed_accounts(id, workspace_id) on delete restrict
);

create index if not exists warmup_messages_due_idx
  on public.warmup_messages (status, scheduled_for);

create index if not exists warmup_messages_workspace_mailbox_idx
  on public.warmup_messages (workspace_id, mailbox_id, created_at desc);

create table if not exists public.warmup_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  warmup_message_id uuid not null,
  mailbox_id uuid not null,
  seed_account_id uuid not null,
  event_type public.warmup_event_type not null,
  source text not null check (source in ('system', 'zoho_mail', 'gmail_composio')),
  provider_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (warmup_message_id, workspace_id) references public.warmup_messages(id, workspace_id) on delete cascade,
  foreign key (mailbox_id, workspace_id) references public.mailboxes(id, workspace_id) on delete cascade,
  foreign key (seed_account_id, workspace_id) references public.warmup_seed_accounts(id, workspace_id) on delete restrict
);

create unique index if not exists warmup_events_provider_uidx
  on public.warmup_events (workspace_id, provider_event_id)
  where provider_event_id is not null;

create or replace function public.claim_warmup_messages(p_limit integer)
returns setof public.warmup_messages
language sql
security invoker
as $$
  update public.warmup_messages wm
  set status = 'claimed',
      claimed_at = now(),
      updated_at = now()
  where wm.id in (
    select id
    from public.warmup_messages
    where status = 'scheduled'
      and scheduled_for <= now()
    order by scheduled_for asc
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning wm.*;
$$;

create or replace view public.warmup_mailbox_stats
with (security_invoker = true)
as
select
  m.workspace_id,
  m.id as mailbox_id,
  m.email_address,
  m.warmup_enabled,
  m.warmup_daily_limit,
  m.warmup_daily_rampup,
  m.warmup_randomize_daily_count,
  m.warmup_reply_rate_percent,
  m.warmup_started_at,
  count(wm.id) filter (
    where wm.sent_at >= (date_trunc('day', now() at time zone m.timezone) at time zone m.timezone)
      and wm.sent_at < ((date_trunc('day', now() at time zone m.timezone) + interval '1 day') at time zone m.timezone)
  )::integer as sent_today,
  least(
    m.warmup_daily_limit,
    greatest(
      1,
      (((now() at time zone m.timezone)::date - (coalesce(m.warmup_started_at, now()) at time zone m.timezone)::date) + 1)::integer
    ) * m.warmup_daily_rampup
  )::integer as warmup_target_today,
  count(wm.id) filter (where wm.sent_at >= now() - interval '7 days')::integer as sent_7d,
  count(wm.id) filter (where wm.landed_folder = 'inbox' and wm.sent_at >= now() - interval '7 days')::integer as inbox_7d,
  count(wm.id) filter (where wm.landed_folder = 'spam' and wm.sent_at >= now() - interval '7 days')::integer as spam_7d,
  count(wm.id) filter (where wm.rescued_at is not null and wm.sent_at >= now() - interval '7 days')::integer as saved_from_spam_7d,
  count(wm.id) filter (where wm.replied_at is not null and wm.sent_at >= now() - interval '7 days')::integer as replied_7d,
  case
    when count(wm.id) filter (where wm.landed_folder in ('inbox', 'spam') and wm.sent_at >= now() - interval '7 days') = 0 then 100
    else round(
      100.0 * count(wm.id) filter (where wm.landed_folder = 'inbox' and wm.sent_at >= now() - interval '7 days')
      / count(wm.id) filter (where wm.landed_folder in ('inbox', 'spam') and wm.sent_at >= now() - interval '7 days')
    )::integer
  end as reputation
from public.mailboxes m
left join public.warmup_messages wm on wm.workspace_id = m.workspace_id and wm.mailbox_id = m.id
group by m.workspace_id, m.id;

alter table public.warmup_seed_accounts enable row level security;
alter table public.warmup_messages enable row level security;
alter table public.warmup_events enable row level security;

grant select, insert, update on public.warmup_seed_accounts to authenticated;
grant select on public.warmup_messages to authenticated;
grant select on public.warmup_events to authenticated;
grant select on public.warmup_mailbox_stats to authenticated;

grant select, insert, update, delete on public.warmup_seed_accounts to service_role;
grant select, insert, update, delete on public.warmup_messages to service_role;
grant select, insert, update, delete on public.warmup_events to service_role;
grant select on public.warmup_mailbox_stats to service_role;

revoke all on function public.claim_warmup_messages(integer) from public;
revoke all on function public.claim_warmup_messages(integer) from anon;
revoke all on function public.claim_warmup_messages(integer) from authenticated;
grant execute on function public.claim_warmup_messages(integer) to service_role;

drop policy if exists "members can view warmup seeds" on public.warmup_seed_accounts;
create policy "members can view warmup seeds"
on public.warmup_seed_accounts for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "admins can manage warmup seeds" on public.warmup_seed_accounts;
create policy "admins can manage warmup seeds"
on public.warmup_seed_accounts for all
to authenticated
using (private.workspace_role_for(workspace_id) in ('owner', 'admin'))
with check (private.workspace_role_for(workspace_id) in ('owner', 'admin'));

drop policy if exists "members can view warmup messages" on public.warmup_messages;
create policy "members can view warmup messages"
on public.warmup_messages for select
to authenticated
using (private.is_workspace_member(workspace_id));

drop policy if exists "members can view warmup events" on public.warmup_events;
create policy "members can view warmup events"
on public.warmup_events for select
to authenticated
using (private.is_workspace_member(workspace_id));
