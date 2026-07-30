begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'checkin-a@example.test', '', now(), '{}', '{"display_name":"Check-in A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '13000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'checkin-b@example.test', '', now(), '{}', '{"display_name":"Check-in B"}', now(), now())
on conflict (id) do nothing;
insert into public.profiles (id, display_name, timezone) values
  ('13000000-0000-0000-0000-000000000001', 'Check-in A', 'America/Mexico_City'),
  ('13000000-0000-0000-0000-000000000002', 'Check-in B', 'Pacific/Auckland')
on conflict (id) do update set timezone = excluded.timezone;
insert into public.goals (id, user_id, name, priority, active) values
  ('13100000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'Goal A', 1, true),
  ('13200000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000002', 'Goal B', 1, true)
on conflict (id) do nothing;

do $$ begin
  if has_function_privilege('anon', 'public.save_daily_checkin(text,smallint,jsonb)', 'execute') then
    raise exception 'anon can execute daily check-in RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.save_daily_checkin(text,smallint,jsonb)', 'execute') then
    raise exception 'authenticated cannot execute daily check-in RPC';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'save_daily_checkin' and p.prosecdef
  ) then raise exception 'daily check-in RPC is not security invoker'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
select * from public.save_daily_checkin(
  'Pacific/Auckland', 2,
  '[{"goal_id":"13100000-0000-0000-0000-000000000001","state":"done","trigger":null}]'::jsonb
);
select * from public.save_daily_checkin(
  'Pacific/Auckland', 4,
  '[{"goal_id":"13100000-0000-0000-0000-000000000001","state":"event","trigger":"Estrés"}]'::jsonb
);
reset role;

do $$ begin
  if (select count(*) from public.daily_entries where user_id = '13000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'repeat save created more than one owner/local-day row';
  end if;
  if not exists (
    select 1 from public.daily_entries d join public.habit_entries h on h.daily_entry_id = d.id
    where d.user_id = '13000000-0000-0000-0000-000000000001'
      and d.craving_level = 4 and h.state = 'event' and h.trigger = 'Estrés'
  ) then raise exception 'repeat save did not atomically update daily and habit rows'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
do $$
declare rejected boolean := false;
begin
  begin
    perform public.save_daily_checkin(
      'America/Mexico_City', 5,
      '[{"goal_id":"13200000-0000-0000-0000-000000000001","state":"done","trigger":null}]'::jsonb
    );
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'foreign owner goal was accepted'; end if;
end $$;
reset role;

do $$ begin
  if exists (select 1 from public.private_notes where user_id = '13000000-0000-0000-0000-000000000001') then
    raise exception 'daily check-in RPC wrote a private note';
  end if;
  if not exists (
    select 1 from public.daily_entries d join public.habit_entries h on h.daily_entry_id = d.id
    where d.user_id = '13000000-0000-0000-0000-000000000001'
      and d.craving_level = 4 and h.goal_id = '13100000-0000-0000-0000-000000000001'
  ) then raise exception 'failed foreign write changed the prior atomic result'; end if;
end $$;

rollback;
