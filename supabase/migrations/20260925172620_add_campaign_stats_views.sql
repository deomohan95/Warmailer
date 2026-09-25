create or replace view public.campaign_stats
with (security_invoker = true)
as
select
  c.id as campaign_id,
  c.workspace_id,
  count(*) filter (where me.event_type = 'smtp_accepted') as sent_count,
  count(*) filter (where me.event_type = 'open') as open_count,
  count(*) filter (where me.event_type = 'reply') as reply_count,
  count(*) filter (where me.event_type = 'bounce') as bounce_count,
  count(*) filter (where me.event_type = 'queued') as queued_count,
  greatest(
    coalesce(c.last_activity_at, c.updated_at),
    coalesce(max(me.occurred_at), c.updated_at)
  ) as last_activity_at
from public.campaigns c
left join public.messages m
  on m.workspace_id = c.workspace_id
 and m.campaign_id = c.id
left join public.message_events me
  on me.workspace_id = m.workspace_id
 and me.message_id = m.id
group by
  c.id,
  c.workspace_id,
  c.last_activity_at,
  c.updated_at;

create or replace view public.campaign_daily_stats
with (security_invoker = true)
as
select
  m.campaign_id,
  m.workspace_id,
  me.occurred_at::date as activity_date,
  count(*) filter (where me.event_type = 'smtp_accepted') as sent_count,
  count(*) filter (where me.event_type = 'open') as open_count,
  count(*) filter (where me.event_type = 'reply') as reply_count
from public.messages m
join public.message_events me
  on me.workspace_id = m.workspace_id
 and me.message_id = m.id
where m.campaign_id is not null
group by
  m.campaign_id,
  m.workspace_id,
  me.occurred_at::date;

grant select on public.campaign_stats to authenticated;
grant select on public.campaign_daily_stats to authenticated;
