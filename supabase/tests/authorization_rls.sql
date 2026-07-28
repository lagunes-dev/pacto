begin;

do $$
declare missing_force_rls integer;
begin
  select count(*) into missing_force_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any (array[
      'profiles', 'partnerships', 'sharing_preferences', 'communication_preferences', 'goals',
      'daily_entries', 'habit_entries', 'private_notes', 'recovery_plans',
      'support_requests', 'shared_daily_summaries'
    ]) and (not c.relrowsecurity or not c.relforcerowsecurity);
  if missing_force_rls <> 0 then raise exception 'protected tables missing forced RLS: %', missing_force_rls; end if;
end $$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'a@example.test', '', now(), '{}', '{"display_name":"User A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'b@example.test', '', now(), '{}', '{"display_name":"User B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'c@example.test', '', now(), '{}', '{"display_name":"User C"}', now(), now())
on conflict (id) do nothing;

insert into public.partnerships (id, inviter_id, invitee_id, invite_code, status, accepted_at)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'rls-test-active', 'active', now())
on conflict (id) do update set status = 'active';
insert into public.goals (id, user_id, name)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Private goal')
on conflict (id) do nothing;
insert into public.daily_entries (id, user_id, entry_date)
values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', date '2099-01-01')
on conflict (id) do nothing;
insert into public.private_notes (id, user_id, daily_entry_id, body)
values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'never shared')
on conflict (id) do nothing;
insert into public.support_requests (id, requester_id, partnership_id, support_type)
values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'check-in')
on conflict (id) do nothing;

do $$
begin
  begin
    insert into public.shared_daily_summaries (daily_entry_id, owner_id)
    values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
    raise exception 'ownership-linked summary accepted a mismatched owner';
  exception when foreign_key_violation then
    null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
do $$
begin
  if exists (select 1 from public.goals where id = '30000000-0000-0000-0000-000000000001') then
    raise exception 'User C disclosed User A goal';
  end if;
  if exists (select 1 from public.private_notes where id = '50000000-0000-0000-0000-000000000001') then
    raise exception 'User C disclosed User A private note';
  end if;
  update public.goals set name = 'intrusion' where id = '30000000-0000-0000-0000-000000000001';
  if found then raise exception 'User C mutated User A goal'; end if;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$ begin
  if not exists (select 1 from public.support_requests where id = '60000000-0000-0000-0000-000000000001') then
    raise exception 'active member cannot read support request';
  end if;
  if exists (select 1 from public.private_notes where id = '50000000-0000-0000-0000-000000000001') then
    raise exception 'partner disclosed private note';
  end if;
end $$;

reset role;
update public.partnerships set status = 'paused' where id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$ begin
  if exists (select 1 from public.support_requests where id = '60000000-0000-0000-0000-000000000001') then
    raise exception 'paused member retained support access';
  end if;
end $$;

reset role;
update public.partnerships set status = 'ended' where id = '20000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$ begin
  if exists (select 1 from public.support_requests where id = '60000000-0000-0000-0000-000000000001') then
    raise exception 'ended member retained support access';
  end if;
end $$;

rollback;
