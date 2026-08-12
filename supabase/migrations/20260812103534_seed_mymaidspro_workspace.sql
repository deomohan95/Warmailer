insert into public.workspaces (name)
select 'MyMaidsPro'
where not exists (
  select 1
  from public.workspaces
  where lower(name) = lower('MyMaidsPro')
);
