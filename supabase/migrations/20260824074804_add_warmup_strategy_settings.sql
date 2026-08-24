alter table public.mailboxes
  add column if not exists warmup_random_min integer not null default 1 check (warmup_random_min between 1 and 100),
  add column if not exists warmup_inbound_original_percent integer not null default 20 check (warmup_inbound_original_percent between 0 and 100),
  add column if not exists warmup_inbound_reply_rate_percent integer not null default 52 check (warmup_inbound_reply_rate_percent between 0 and 100);

drop view if exists public.warmup_mailbox_stats;

create or replace view public.warmup_mailbox_stats
with (security_invoker = true)
as
with mailbox_stats as (
  select
    m.workspace_id,
    m.id as mailbox_id,
    m.email_address,
    m.warmup_enabled,
    m.warmup_daily_limit,
    m.warmup_daily_rampup,
    m.warmup_randomize_daily_count,
    m.warmup_random_min,
    m.warmup_reply_rate_percent,
    m.warmup_inbound_original_percent,
    m.warmup_inbound_reply_rate_percent,
    m.warmup_started_at,
    least(
      m.warmup_daily_limit,
      greatest(
        1,
        (((now() at time zone m.timezone)::date - (coalesce(m.warmup_started_at, now()) at time zone m.timezone)::date) + 1)::integer
      ) * m.warmup_daily_rampup
    )::integer as raw_target_today,
    count(wm.id) filter (
      where wm.sent_at >= (date_trunc('day', now() at time zone m.timezone) at time zone m.timezone)
        and wm.sent_at < ((date_trunc('day', now() at time zone m.timezone) + interval '1 day') at time zone m.timezone)
    )::integer as sent_today,
    count(wm.id) filter (where wm.direction = 'mailbox_to_seed' and wm.sent_at >= now() - interval '7 days')::integer as sent_7d,
    count(wm.id) filter (where wm.direction = 'seed_to_mailbox' and wm.landed_folder in ('inbox', 'spam') and wm.sent_at >= now() - interval '7 days')::integer as received_7d,
    count(wm.id) filter (where wm.landed_folder = 'inbox' and wm.sent_at >= now() - interval '7 days')::integer as inbox_7d,
    count(wm.id) filter (where wm.landed_folder = 'spam' and wm.sent_at >= now() - interval '7 days')::integer as spam_7d,
    count(wm.id) filter (where wm.rescued_at is not null and wm.sent_at >= now() - interval '7 days')::integer as saved_from_spam_7d,
    count(wm.id) filter (where wm.replied_at is not null and wm.sent_at >= now() - interval '7 days')::integer as replied_7d,
    count(wm.id) filter (where wm.landed_folder in ('inbox', 'spam') and wm.sent_at >= now() - interval '7 days')::integer as checked_7d,
    decode(substr(md5(m.id::text || ':' || ((now() at time zone m.timezone)::date)::text), 1, 8), 'hex') as warmup_hash
  from public.mailboxes m
  left join public.warmup_messages wm on wm.workspace_id = m.workspace_id and wm.mailbox_id = m.id
  group by m.workspace_id, m.id
)
select
  workspace_id,
  mailbox_id,
  email_address,
  warmup_enabled,
  warmup_daily_limit,
  warmup_daily_rampup,
  warmup_randomize_daily_count,
  warmup_random_min,
  warmup_reply_rate_percent,
  warmup_inbound_original_percent,
  warmup_inbound_reply_rate_percent,
  warmup_started_at,
  sent_today,
  case
    when not warmup_randomize_daily_count then raw_target_today
    else
      greatest(1, least(raw_target_today, warmup_random_min))
      + (
        (
          get_byte(warmup_hash, 0)::bigint * 16777216
          + get_byte(warmup_hash, 1)::bigint * 65536
          + get_byte(warmup_hash, 2)::bigint * 256
          + get_byte(warmup_hash, 3)::bigint
        ) % (raw_target_today - greatest(1, least(raw_target_today, warmup_random_min)) + 1)
      )::integer
  end as warmup_target_today,
  sent_7d,
  received_7d,
  inbox_7d,
  spam_7d,
  saved_from_spam_7d,
  replied_7d,
  case
    when checked_7d = 0 then null
    else round(100.0 * inbox_7d / checked_7d)::integer
  end as reputation
from mailbox_stats;

grant select on public.warmup_mailbox_stats to authenticated;
grant select on public.warmup_mailbox_stats to service_role;
