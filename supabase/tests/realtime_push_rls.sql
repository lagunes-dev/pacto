begin;

do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'partnership_realtime_state'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then raise exception 'partnership realtime state must force RLS'; end if;

  if has_table_privilege('authenticated', 'public.partnership_realtime_state', 'insert,update,delete')
     or not has_table_privilege('authenticated', 'public.partnership_realtime_state', 'select') then
    raise exception 'authenticated role must have select-only signal access';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'partnership_realtime_state'
      and policyname = 'partnership_realtime_state_owner_select'
      and cmd = 'SELECT' and qual like '%auth.uid()%'
  ) then raise exception 'owner-only signal policy is missing'; end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.partnerships'::regclass
      and tgname = 'sync_partnership_realtime_state_trigger' and not tgisinternal
  ) then raise exception 'partnership signal trigger is missing'; end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and exists (
       select required.table_name
       from unnest(array['support_requests','sharing_preferences','communication_preferences','partnership_realtime_state']) required(table_name)
       where not exists (
         select 1 from pg_publication_tables published
         where published.pubname = 'supabase_realtime' and published.schemaname = 'public'
           and published.tablename = required.table_name
       )
     ) then raise exception 'filtered Realtime tables must be published'; end if;
end;
$$;

rollback;
