begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rpc-a@example.test', '', now(), '{}', '{"display_name":"RPC User A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rpc-b@example.test', '', now(), '{}', '{"display_name":"RPC User B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'rpc-c@example.test', '', now(), '{}', '{"display_name":"RPC User C"}', now(), now())
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'support_requests' and column_name = 'request_message')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'support_requests' and column_name = 'response_type') then
    raise exception 'support request message columns are missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.support_requests'::regclass and conname = 'support_requests_request_message_length')
     or not exists (select 1 from pg_constraint where conrelid = 'public.support_requests'::regclass and conname = 'support_requests_response_type_allowlist') then
    raise exception 'support request message constraints are missing';
  end if;
end $$;

do $$
begin
  if has_function_privilege('authenticated', 'private.require_actor()', 'execute')
     or has_function_privilege('authenticated', 'private.active_partnership_id()', 'execute') then
    raise exception 'authenticated can execute private lifecycle helpers';
  end if;
  if has_table_privilege('authenticated', 'public.partnerships', 'insert,update,delete')
     or has_table_privilege('authenticated', 'public.support_requests', 'insert,update,delete') then
    raise exception 'authenticated retained direct lifecycle mutation privileges';
  end if;
end $$;

-- Invite rejection by the intended recipient.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select * from public.create_partnership_invite(' RPC-B@example.test ');
reset role;
select set_config('pacto.test.invite_code', (
  select p.invite_code from public.partnerships p
  where p.inviter_id = '11000000-0000-0000-0000-000000000001' and p.status = 'pending'
  order by p.created_at desc limit 1
), true);
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select * from public.reject_partnership_invite(current_setting('pacto.test.invite_code'));
reset role;
do $$ begin
  if not exists (
    select 1 from public.partnerships p
    where p.invite_code = current_setting('pacto.test.invite_code') and p.status = 'ended'
  ) then raise exception 'invite rejection did not end the pending invite'; end if;
end $$;

-- Pending invite cancellation by the inviter.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select * from public.create_partnership_invite('rpc-b@example.test');
select * from public.cancel_pending_partnership();
reset role;
do $$ begin
  if exists (
    select 1 from public.partnerships p
    where p.inviter_id = '11000000-0000-0000-0000-000000000001' and p.status = 'pending'
  ) then raise exception 'cancel left a pending invite'; end if;
end $$;

-- Only the targeted invitee may redeem and accept the invite.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select * from public.create_partnership_invite('rpc-b@example.test');
reset role;
select set_config('pacto.test.invite_code', (
  select p.invite_code from public.partnerships p
  where p.inviter_id = '11000000-0000-0000-0000-000000000001' and p.status = 'pending'
  order by p.created_at desc limit 1
), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
do $$
declare rejected boolean := false;
begin
  begin
    perform public.accept_partnership_invite(current_setting('pacto.test.invite_code'));
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'intruder accepted another user invite'; end if;
end $$;
reset role;
do $$ begin
  if not exists (
    select 1 from public.partnerships p
    where p.invite_code = current_setting('pacto.test.invite_code') and p.status = 'pending'
  ) then raise exception 'failed intruder redemption changed invite state'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select set_config('pacto.test.partnership_id', accepted_invite.partnership_id::text, true)
from public.accept_partnership_invite(current_setting('pacto.test.invite_code')) accepted_invite;
do $$ begin
  if not exists (
    select 1 from public.get_my_partnership_state() s
    where s.partnership_id = current_setting('pacto.test.partnership_id')::uuid
      and s.partnership_status = 'active'
      and s.member_role = 'invitee'
      and s.partner_id = '11000000-0000-0000-0000-000000000001'
  ) then raise exception 'accepted member cannot read safe partnership state'; end if;
end $$;
reset role;

-- Browser roles cannot bypass RPC transition checks or mutate lifecycle identity.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
do $$
declare rejected boolean := false;
begin
  begin
    update public.partnerships
    set invite_code = 'forged-lifecycle-identity'
    where invite_code = current_setting('pacto.test.invite_code');
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'direct partnership identity mutation was allowed'; end if;
end $$;
reset role;
do $$ begin
  if not exists (
    select 1 from public.partnerships p
    where p.invite_code = current_setting('pacto.test.invite_code')
      and p.inviter_id = '11000000-0000-0000-0000-000000000001'
      and p.invitee_id = '11000000-0000-0000-0000-000000000002'
  ) then raise exception 'partnership lifecycle identity changed'; end if;
end $$;

-- Every exact support choice creates one pending request and nothing else is accepted.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select * from public.create_support_request('distraction', 'not_urgent');
select * from public.create_support_request('food_choice', null);
select * from public.create_support_request('motivation', 'when_available');
select * from public.create_support_request('conversation', null);
select * from public.create_support_request('presence_no_advice', 'no_reply_needed');
reset role;
do $$ begin
  if (select count(*) from public.support_requests r
      where r.requester_id = '11000000-0000-0000-0000-000000000001'
        and r.status = 'pending'
        and r.support_type in ('distraction', 'food_choice', 'motivation', 'conversation', 'presence_no_advice')) <> 5 then
    raise exception 'exact support choices did not each create one pending request';
  end if;
end $$;
select set_config('pacto.test.support_id', (
  select r.id::text from public.support_requests r
  where r.requester_id = '11000000-0000-0000-0000-000000000001'
  order by r.created_at desc limit 1
), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
do $$
declare rejected boolean := false; before_count bigint;
begin
  select count(*) into before_count from public.support_requests;
  begin perform public.create_support_request('private_food_details', 'not_urgent'); exception when others then rejected := true; end;
  if not rejected or (select count(*) from public.support_requests) <> before_count then
    raise exception 'unlisted support choice created a request';
  end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
do $$
declare rejected boolean := false;
begin
  begin
    perform public.acknowledge_support_request(current_setting('pacto.test.support_id')::uuid, 'available_now');
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'requester acknowledged their own support request'; end if;
end $$;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000003', true);
do $$
declare rejected boolean := false;
begin
  begin
    perform public.acknowledge_support_request(current_setting('pacto.test.support_id')::uuid, 'available_now');
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'intruder acknowledged a support request'; end if;
end $$;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
select * from public.acknowledge_support_request(current_setting('pacto.test.support_id')::uuid, 'available_now');
select * from public.close_support_request(current_setting('pacto.test.support_id')::uuid);
reset role;
do $$ begin
  if not exists (
    select 1 from public.support_requests r
    where r.id = current_setting('pacto.test.support_id')::uuid
      and r.status = 'closed' and r.acknowledged_at is not null
  ) then raise exception 'support request did not complete its lifecycle'; end if;
end $$;

-- Pause revokes support immediately; either member may then end irreversibly.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
select * from public.pause_partnership();
select set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
do $$
declare rejected boolean := false;
begin
  begin
    perform public.create_support_request('conversation', null);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'paused member created a support request'; end if;
end $$;
select * from public.end_partnership();
do $$
declare rejected boolean := false;
begin
  begin perform public.pause_partnership(); exception when others then rejected := true; end;
  if not rejected then raise exception 'ended partnership returned to paused'; end if;
end $$;
do $$ begin
  if exists (
    select 1 from public.get_my_partnership_state() s
    where s.partnership_status = 'ended' and s.partner_id is not null
  ) then raise exception 'ended partnership state disclosed the former partner'; end if;
end $$;
reset role;
do $$ begin
  if not exists (
    select 1 from public.partnerships p
    where p.invite_code = current_setting('pacto.test.invite_code') and p.status = 'ended'
  ) then raise exception 'partnership did not end'; end if;
end $$;

rollback;
