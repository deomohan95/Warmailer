BEGIN;
SELECT plan(11);

create temp table celeste_ids (
  user_a uuid,
  user_b uuid,
  workspace_a uuid,
  workspace_b uuid,
  lead_a uuid,
  lead_b uuid
);

insert into celeste_ids values (
  '00000000-0000-4000-8000-00000000000a',
  '00000000-0000-4000-8000-00000000000b',
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid(),
  gen_random_uuid()
);

insert into public.workspaces (id, name)
select workspace_a, 'Workspace A' from celeste_ids
union all
select workspace_b, 'Workspace B' from celeste_ids;

insert into public.workspace_members (workspace_id, user_id, role)
select workspace_a, user_a, 'admin'::public.workspace_role from celeste_ids
union all
select workspace_b, user_b, 'admin'::public.workspace_role from celeste_ids;

insert into public.all_leads_mmp (
  id,
  workspace_id,
  source_file,
  name,
  company,
  link,
  linkedin_url_normalized,
  name_company_normalized
)
select lead_a, workspace_a, 'a.csv', 'Jane A', 'Acme', 'https://www.linkedin.com/in/jane-a', 'https://www.linkedin.com/in/jane-a', 'jane a|acme'
from celeste_ids
union all
select lead_b, workspace_b, 'b.csv', 'Jane B', 'Beta', 'https://www.linkedin.com/in/jane-b', 'https://www.linkedin.com/in/jane-b', 'jane b|beta'
from celeste_ids;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select user_a::text from celeste_ids), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.all_leads_mmp),
  1::bigint,
  'authenticated user sees only leads from their workspace'
);

select is(
  (select name from public.all_leads_mmp),
  'Jane A',
  'RLS select hides workspace B lead'
);

create or replace function pg_temp.cross_workspace_insert_blocked()
returns boolean
language plpgsql
as $$
begin
  insert into public.all_leads_mmp (
    workspace_id,
    name,
    company,
    name_company_normalized
  )
  select workspace_b, 'Mallory', 'Beta', 'mallory|beta'
  from celeste_ids;

  return false;
exception
  when insufficient_privilege then
    return true;
end;
$$;

select ok(
  pg_temp.cross_workspace_insert_blocked(),
  'RLS blocks insert into another workspace'
);

update public.all_leads_mmp
set company = 'Hacked'
where id = (select lead_b from celeste_ids);

reset role;

select is(
  (select company from public.all_leads_mmp where id = (select lead_b from celeste_ids)),
  'Beta',
  'RLS update cannot mutate another workspace lead'
);

select throws_ok(
  $$
    insert into public.all_leads_mmp (
      workspace_id,
      name,
      company,
      link,
      linkedin_url_normalized,
      name_company_normalized
    )
    select workspace_a, 'Duplicate Jane', 'Acme', 'https://www.linkedin.com/in/jane-a/', 'https://www.linkedin.com/in/jane-a', 'duplicate jane|acme'
    from celeste_ids
  $$,
  '23505',
  'workspace-scoped LinkedIn identity is unique'
);

select throws_ok(
  $$
    insert into public.all_leads_mmp (
      workspace_id,
      name,
      company,
      name_company_normalized
    )
    select workspace_a, 'Jane A', 'Acme', 'jane a|acme'
    from celeste_ids
  $$,
  '23505',
  'workspace-scoped name-company fallback identity is unique when LinkedIn is absent'
);

insert into public.lead_imports (workspace_id, source_file, status)
select workspace_a, 'apollo.csv', 'queued'::public.job_status
from celeste_ids;

insert into public.lead_import_rows (
  workspace_id,
  import_id,
  row_number,
  lead_id,
  raw_data,
  normalized_data,
  action
)
select workspace_a, li.id, 1, lead_a, '{}'::jsonb, '{}'::jsonb, 'updated'
from celeste_ids
join public.lead_imports li on li.workspace_id = celeste_ids.workspace_a;

select is(
  (select count(*) from public.lead_import_rows),
  1::bigint,
  'import rows can link to leads inside the same workspace'
);

select throws_ok(
  $$
    insert into public.lead_import_rows (
      workspace_id,
      import_id,
      row_number,
      lead_id,
      raw_data,
      normalized_data,
      action
    )
    select workspace_a, li.id, 2, lead_b, '{}'::jsonb, '{}'::jsonb, 'updated'
    from celeste_ids
    join public.lead_imports li on li.workspace_id = celeste_ids.workspace_a
  $$,
  '23503',
  'import rows cannot cross-link leads from another workspace'
);

insert into public.enrichment_batches (workspace_id, selection, total_items)
select workspace_a, '{"leadIds":[]}'::jsonb, 1
from celeste_ids;

insert into public.enrichment_items (
  workspace_id,
  batch_id,
  lead_id,
  linkedin_url_normalized
)
select workspace_a, eb.id, lead_a, 'https://www.linkedin.com/in/jane-a'
from celeste_ids
join public.enrichment_batches eb on eb.workspace_id = celeste_ids.workspace_a;

select is(
  (select count(*) from public.enrichment_items),
  1::bigint,
  'enrichment items can link to same-workspace leads'
);

select throws_ok(
  $$
    insert into public.enrichment_items (
      workspace_id,
      batch_id,
      lead_id,
      linkedin_url_normalized
    )
    select workspace_a, eb.id, lead_b, 'https://www.linkedin.com/in/jane-b'
    from celeste_ids
    join public.enrichment_batches eb on eb.workspace_id = celeste_ids.workspace_a
  $$,
  '23503',
  'enrichment items cannot cross-link leads from another workspace'
);

select throws_ok(
  $$
    insert into public.apify_runs (
      workspace_id,
      actor_id,
      apify_run_id,
      phase,
      input
    )
    select workspace_a, 'UMdANQyqx3b2JVuxg', 'run_1', 'primary', '{"linkedin":"https://www.linkedin.com/in/jane-a"}'::jsonb
    from celeste_ids;

    insert into public.apify_runs (
      workspace_id,
      actor_id,
      apify_run_id,
      phase,
      input
    )
    select workspace_a, 'UMdANQyqx3b2JVuxg', 'run_1', 'primary', '{"linkedin":"https://www.linkedin.com/in/jane-a"}'::jsonb
    from celeste_ids
  $$,
  '23505',
  'Apify run IDs are unique to avoid duplicate paid run bookkeeping'
);

SELECT * FROM finish();
ROLLBACK;
