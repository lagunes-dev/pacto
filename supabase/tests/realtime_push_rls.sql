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

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'push_subscriptions'
      and c.relrowsecurity and c.relforcerowsecurity
  ) then raise exception 'push subscriptions must force RLS'; end if;

  if has_table_privilege('authenticated', 'public.push_subscriptions', 'delete')
     or not has_table_privilege('authenticated', 'public.push_subscriptions', 'select,insert,update') then
    raise exception 'authenticated push grants must be owner lifecycle only';
  end if;

  if (select count(*) from pg_policies where schemaname = 'public'
      and tablename = 'push_subscriptions' and policyname like 'push_subscriptions_owner_%'
      and coalesce(qual, with_check) like '%auth.uid()%') <> 3 then
    raise exception 'push owner policies are incomplete';
  end if;

  if not exists (
    select 1 from pg_trigger where tgrelid = 'public.push_subscriptions'::regclass
      and tgname = 'protect_push_subscription_owner_trigger' and not tgisinternal
  ) then raise exception 'push owner immutability trigger is missing'; end if;
end;
$$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'push-a@example.test', '', now(), '{}', '{"display_name":"Push A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'push-b@example.test', '', now(), '{}', '{"display_name":"Push B"}', now(), now())
on conflict (id) do nothing;

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values ('10000000-0000-0000-0000-000000000001', 'https://push.example/a', 'key-a', 'auth-a');

do $$
begin
  begin
    update public.push_subscriptions set user_id = '10000000-0000-0000-0000-000000000002'
    where endpoint = 'https://push.example/a';
    raise exception 'push owner mutation was allowed';
  exception when check_violation then null;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

do $$
begin
  if exists (select 1 from public.push_subscriptions where endpoint = 'https://push.example/a') then
    raise exception 'foreign push subscription was disclosed';
  end if;
  update public.push_subscriptions set revoked_at = now() where endpoint = 'https://push.example/a';
  if found then raise exception 'foreign push subscription was revoked'; end if;
  begin
    insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
    values ('10000000-0000-0000-0000-000000000001', 'https://push.example/foreign', 'key', 'auth');
    raise exception 'foreign push subscription was inserted';
  exception when insufficient_privilege then null;
  end;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, revoked_at)
values ('10000000-0000-0000-0000-000000000001', 'https://push.example/a', 'key-updated', 'auth-updated', null)
on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, revoked_at = null;

do $$
begin
  if not exists (
    select 1 from public.push_subscriptions where endpoint = 'https://push.example/a'
      and p256dh = 'key-updated' and revoked_at is null
  ) then raise exception 'owner idempotent push upsert failed'; end if;
end $$;

rollback;
