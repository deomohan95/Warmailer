alter table public.campaign_leads
  add column if not exists next_step_order integer not null default 0 check (next_step_order >= 0),
  add column if not exists next_send_at timestamptz,
  add column if not exists mailbox_id uuid;

create index if not exists campaign_leads_due_followups_idx
  on public.campaign_leads (workspace_id, campaign_id, status, next_send_at, next_step_order);

with latest_outbound as (
  select distinct on (campaign_id, lead_id)
    campaign_id,
    lead_id,
    mailbox_id,
    sent_at
  from public.messages
  where direction = 'outbound'
    and campaign_id is not null
    and lead_id is not null
    and sent_at is not null
  order by campaign_id, lead_id, sent_at desc
)
update public.campaign_leads cl
set
  next_step_order = greatest(cl.next_step_order, 1),
  mailbox_id = coalesce(cl.mailbox_id, latest_outbound.mailbox_id),
  next_send_at = coalesce(
    cl.next_send_at,
    case
      when next_step.id is null then null
      else latest_outbound.sent_at + make_interval(days => next_step.delay_days)
    end
  ),
  updated_at = now()
from latest_outbound
left join public.campaign_sequence_steps next_step
  on next_step.campaign_id = latest_outbound.campaign_id
  and next_step.step_order = 1
where cl.campaign_id = latest_outbound.campaign_id
  and cl.lead_id = latest_outbound.lead_id
  and cl.status = 'sent';