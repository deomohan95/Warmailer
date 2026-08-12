create or replace view public.lead_list
with (security_invoker = true)
as
select
  id as lead_id,
  workspace_id,
  source_file,
  name,
  job_title,
  company,
  link,
  linkedin_url_normalized,
  location,
  employees,
  industry,
  email,
  email_status,
  last_enriched_at,
  created_at,
  updated_at
from public.all_leads_mmp;

create or replace view public.lead_readiness
with (security_invoker = true)
as
select
  workspace_id,
  count(*) as imported_count,
  count(*) filter (where email is not null and email_status = 'found') as email_found_count,
  count(*) filter (where email is null and email_status in ('not_enriched', 'not_found', 'failed')) as enrichment_eligible_count,
  count(*) filter (where email_status in ('queued', 'processing')) as enrichment_in_flight_count,
  count(*) filter (where email_status = 'failed') as enrichment_failed_count,
  max(updated_at) as updated_at
from public.all_leads_mmp
group by workspace_id;

create or replace view public.dashboard_overview
with (security_invoker = true)
as
select
  w.id as workspace_id,
  coalesce(lr.imported_count, 0) as imported_count,
  coalesce(lr.email_found_count, 0) as email_found_count,
  coalesce(lr.enrichment_eligible_count, 0) as enrichment_eligible_count,
  count(mc.mailbox_id) filter (where mc.status = 'connected') as connected_mailbox_count,
  coalesce(sum(mc.available_today) filter (where mc.status = 'connected'), 0) as send_capacity_today,
  0::bigint as active_campaign_count,
  0::bigint as unread_thread_count,
  greatest(
    coalesce(lr.updated_at, w.updated_at),
    coalesce(max(mc.updated_at), w.updated_at)
  ) as updated_at
from public.workspaces w
left join public.lead_readiness lr
  on lr.workspace_id = w.id
left join public.mailbox_capacity mc
  on mc.workspace_id = w.id
group by
  w.id,
  w.updated_at,
  lr.imported_count,
  lr.email_found_count,
  lr.enrichment_eligible_count,
  lr.updated_at;

grant select on public.lead_list to authenticated;
grant select on public.lead_readiness to authenticated;
grant select on public.dashboard_overview to authenticated;
