begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'recovery-a@example.test', '', now(), '{}', '{"display_name":"Recovery A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '14000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'recovery-b@example.test', '', now(), '{}', '{"display_name":"Recovery B"}', now(), now())
on conflict (id) do nothing;

insert into public.partnerships (id, inviter_id, invitee_id, invite_code, status, accepted_at)
values (
  '14100000-0000-0000-0000-000000000001',
  '14000000-0000-0000-0000-000000000001',
  '14000000-0000-0000-0000-000000000002',
  'recovery-partner', 'active', now()
) on conflict (id) do update set status = 'active';

insert into public.weekly_review_records (user_id, week_start, reflection, next_step)
values (
  '14000000-0000-0000-0000-000000000001', current_date - 7,
  'La alternativa ayudó esta semana', 'Prepararla antes del momento difícil'
);

do $$ begin
  if has_function_privilege('anon', 'public.save_recovery_record(uuid,integer,text,text,text,text,text)', 'execute') then
    raise exception 'anon can execute recovery RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.save_recovery_record(uuid,integer,text,text,text,text,text)', 'execute') then
    raise exception 'authenticated cannot execute recovery RPC';
  end if;
  if not has_table_privilege('authenticated', 'public.private_notes', 'select,insert,update,delete') then
    raise exception 'authenticated cannot access private notes table';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
select * from public.save_recovery_record(
  '14200000-0000-0000-0000-000000000001', 0,
  'Estrés', 'Después del trabajo', 'Una pausa', 'Caminar cinco minutos', 'Solo para mí'
);
select * from public.save_recovery_record(
  '14200000-0000-0000-0000-000000000001', 0,
  'Estrés', 'Después del trabajo', 'Una pausa', 'Caminar cinco minutos', 'Solo para mí'
);
reset role;

do $$ begin
  if (select count(*) from public.recovery_plans where user_id = '14000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'same operation and payload created a duplicate recovery plan';
  end if;
  if (select count(*) from public.recovery_event_records where user_id = '14000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'same operation and payload created a duplicate timeline event';
  end if;
  if (select count(*) from public.private_notes where user_id = '14000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'same operation and payload created a duplicate private note';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000001', true);
do $$
declare rejected boolean := false;
begin
  begin
    perform public.save_recovery_record(
      '14200000-0000-0000-0000-000000000001', 0,
      'Hambre', 'Por la tarde', 'Comer', 'Preparar una opción', null
    );
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'operation ID accepted a different payload'; end if;

  rejected := false;
  begin
    perform public.save_recovery_record(
      '14200000-0000-0000-0000-000000000002', 0,
      'Hambre', 'Por la tarde', 'Comer', 'Preparar una opción', null
    );
  exception when serialization_failure then rejected := true;
  end;
  if not rejected then raise exception 'stale expected revision overwrote recovery history'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '14000000-0000-0000-0000-000000000002', true);
do $$ begin
  if exists (select 1 from public.private_notes) then
    raise exception 'partner could read an owner private note';
  end if;
  if exists (select 1 from public.recovery_event_records) then
    raise exception 'partner could read detailed owner recovery events';
  end if;
  if exists (select 1 from public.weekly_review_records) then
    raise exception 'partner could read an owner weekly review';
  end if;
end $$;
reset role;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('support_requests', 'shared_daily_summaries')
      and column_name in ('body', 'private_note', 'private_note_id', 'recovery_plan_id')
  ) then raise exception 'private recovery payload leaked into a support/shared projection'; end if;
end $$;

rollback;
