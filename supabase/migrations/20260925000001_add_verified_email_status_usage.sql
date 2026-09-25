alter table public.all_leads_mmp
  add constraint all_leads_mmp_verified_has_email check (
    email_status <> 'verified' or email is not null
  );

create or replace view public.lead_readiness
with (security_invoker = on)
as
select
  workspace_id,
  count(*) as imported_count,
  count(*) filter (where email is not null and email_status in ('found', 'verified')) as email_found_count,
  count(*) filter (where email is null and email_status in ('not_enriched', 'not_found', 'failed')) as enrichment_eligible_count,
  count(*) filter (where email_status in ('queued', 'processing')) as enrichment_in_flight_count,
  count(*) filter (where email_status = 'failed') as enrichment_failed_count,
  max(updated_at) as updated_at
from public.all_leads_mmp
group by workspace_id;
