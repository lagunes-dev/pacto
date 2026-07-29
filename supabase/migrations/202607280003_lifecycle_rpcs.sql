begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.require_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  return actor_id;
end;
$$;

create or replace function private.active_partnership_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_actor();
  partnership_id uuid;
begin
  select p.id into partnership_id
  from public.partnerships p
  where p.status = 'active'
    and actor_id in (p.inviter_id, p.invitee_id);

  if partnership_id is null then
    raise exception 'active partnership required' using errcode = '42501';
  end if;
  return partnership_id;
end;
$$;

drop function if exists public.create_partnership_invite(text);
create or replace function public.create_partnership_invite(target_email text)
returns table (
  partnership_id uuid,
  invite_code text,
  partnership_status public.partnership_status,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_actor();
  target_id uuid;
  normalized_target text := lower(btrim(target_email));
begin
  if target_email is null or char_length(normalized_target) not between 3 and 254
     or normalized_target !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'invite unavailable' using errcode = '22023';
  end if;

  select u.id into target_id
  from auth.users u
  where lower(u.email) = normalized_target
  limit 1;

  if target_id is null or target_id = actor_id
     or exists (
       select 1 from public.partnerships p
       where p.status in ('pending', 'active', 'paused')
         and (actor_id in (p.inviter_id, p.invitee_id)
           or target_id in (p.inviter_id, p.invitee_id))
     ) then
    raise exception 'invite unavailable' using errcode = 'P0001';
  end if;

  return query
  insert into public.partnerships (inviter_id, invitee_id, invite_code, status)
  values (actor_id, target_id, encode(extensions.gen_random_bytes(18), 'hex'), 'pending')
  returning partnerships.id, partnerships.invite_code, partnerships.status, partnerships.created_at;
exception
  when unique_violation then
    raise exception 'invite unavailable' using errcode = 'P0001';
end;
$$;

create or replace function public.accept_partnership_invite(code text)
returns table (
  partnership_id uuid,
  partnership_status public.partnership_status,
  partner_id uuid,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_actor();
  normalized_code text := btrim(code);
begin
  if code is null or char_length(normalized_code) not between 16 and 128 then
    raise exception 'invite unavailable' using errcode = '22023';
  end if;

  return query
  update public.partnerships p
  set status = 'active', accepted_at = clock_timestamp()
  where p.invite_code = normalized_code
    and p.status = 'pending'
    and p.invitee_id = actor_id
  returning p.id, p.status, p.inviter_id, p.accepted_at;

  if not found then
    raise exception 'invite unavailable' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.reject_partnership_invite(code text)
returns table (partnership_id uuid, partnership_status public.partnership_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_actor();
  normalized_code text := btrim(code);
begin
  if code is null or char_length(normalized_code) not between 16 and 128 then
    raise exception 'invite unavailable' using errcode = '22023';
  end if;

  return query
  update public.partnerships p set status = 'ended'
  where p.invite_code = normalized_code
    and p.status = 'pending'
    and p.invitee_id = actor_id
  returning p.id, p.status;

  if not found then
    raise exception 'invite unavailable' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.cancel_pending_partnership()
returns table (partnership_id uuid, partnership_status public.partnership_status)
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.require_actor();
begin
  return query
  update public.partnerships p set status = 'ended'
  where p.inviter_id = actor_id and p.status = 'pending'
  returning p.id, p.status;

  if not found then
    raise exception 'pending partnership required' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.pause_partnership()
returns table (partnership_id uuid, partnership_status public.partnership_status)
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.require_actor();
begin
  return query
  update public.partnerships p set status = 'paused'
  where p.status = 'active' and actor_id in (p.inviter_id, p.invitee_id)
  returning p.id, p.status;

  if not found then
    raise exception 'active partnership required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.end_partnership()
returns table (partnership_id uuid, partnership_status public.partnership_status)
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.require_actor();
begin
  return query
  update public.partnerships p set status = 'ended'
  where p.status in ('active', 'paused') and actor_id in (p.inviter_id, p.invitee_id)
  returning p.id, p.status;

  if not found then
    raise exception 'current partnership required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.get_my_partnership_state()
returns table (
  partnership_id uuid,
  partnership_status public.partnership_status,
  member_role text,
  partner_id uuid,
  accepted_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
    p.status,
    case when p.inviter_id = private.require_actor() then 'inviter' else 'invitee' end,
    case
      when p.status <> 'active' then null
      when p.inviter_id = private.require_actor() then p.invitee_id
      else p.inviter_id
    end,
    p.accepted_at,
    p.created_at
  from public.partnerships p
  where private.require_actor() in (p.inviter_id, p.invitee_id)
  order by (p.status <> 'ended') desc,
    p.accepted_at desc nulls last,
    p.created_at desc,
    p.id desc
  limit 1
$$;

drop function if exists public.create_support_request(text);
create or replace function public.create_support_request(request_type text)
returns table (
  support_request_id uuid,
  requester_id uuid,
  support_type text,
  support_status public.support_status,
  created_at timestamptz,
  acknowledged_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_actor();
  partnership_id uuid := private.active_partnership_id();
  normalized_type text := btrim(request_type);
begin
  if request_type is null or char_length(normalized_type) not between 1 and 80 then
    raise exception 'invalid support type' using errcode = '22023';
  end if;

  return query
  insert into public.support_requests (requester_id, partnership_id, support_type)
  values (actor_id, partnership_id, normalized_type)
  returning support_requests.id, support_requests.requester_id, support_requests.support_type, support_requests.status,
    support_requests.created_at, support_requests.acknowledged_at;
end;
$$;

drop function if exists public.acknowledge_support_request(uuid);
create or replace function public.acknowledge_support_request(request_id uuid)
returns table (
  support_request_id uuid,
  requester_id uuid,
  support_type text,
  support_status public.support_status,
  created_at timestamptz,
  acknowledged_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.require_actor();
begin
  if request_id is null then raise exception 'support request unavailable' using errcode = '22023'; end if;

  return query
  update public.support_requests r
  set status = 'acknowledged', acknowledged_at = clock_timestamp()
  from public.partnerships p
  where r.id = request_id
    and p.id = r.partnership_id
    and p.status = 'active'
    and actor_id in (p.inviter_id, p.invitee_id)
    and actor_id <> r.requester_id
    and r.status = 'pending'
  returning r.id, r.requester_id, r.support_type, r.status, r.created_at, r.acknowledged_at;

  if not found then raise exception 'support request unavailable' using errcode = '42501'; end if;
end;
$$;

drop function if exists public.close_support_request(uuid);
create or replace function public.close_support_request(request_id uuid)
returns table (
  support_request_id uuid,
  requester_id uuid,
  support_type text,
  support_status public.support_status,
  created_at timestamptz,
  acknowledged_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.require_actor();
begin
  if request_id is null then raise exception 'support request unavailable' using errcode = '22023'; end if;

  return query
  update public.support_requests r
  set status = 'closed'
  from public.partnerships p
  where r.id = request_id
    and p.id = r.partnership_id
    and p.status = 'active'
    and actor_id in (p.inviter_id, p.invitee_id)
    and actor_id <> r.requester_id
    and r.status = 'acknowledged'
  returning r.id, r.requester_id, r.support_type, r.status, r.created_at, r.acknowledged_at;

  if not found then raise exception 'support request unavailable' using errcode = '42501'; end if;
end;
$$;

revoke all on function private.require_actor() from public, anon, authenticated;
revoke all on function private.active_partnership_id() from public, anon, authenticated;
revoke all on function public.create_partnership_invite(text) from public, anon, authenticated;
revoke all on function public.accept_partnership_invite(text) from public, anon, authenticated;
revoke all on function public.reject_partnership_invite(text) from public, anon, authenticated;
revoke all on function public.cancel_pending_partnership() from public, anon, authenticated;
revoke all on function public.pause_partnership() from public, anon, authenticated;
revoke all on function public.end_partnership() from public, anon, authenticated;
revoke all on function public.get_my_partnership_state() from public, anon, authenticated;
revoke all on function public.create_support_request(text) from public, anon, authenticated;
revoke all on function public.acknowledge_support_request(uuid) from public, anon, authenticated;
revoke all on function public.close_support_request(uuid) from public, anon, authenticated;

grant execute on function public.create_partnership_invite(text) to authenticated;
grant execute on function public.accept_partnership_invite(text) to authenticated;
grant execute on function public.reject_partnership_invite(text) to authenticated;
grant execute on function public.cancel_pending_partnership() to authenticated;
grant execute on function public.pause_partnership() to authenticated;
grant execute on function public.end_partnership() to authenticated;
grant execute on function public.get_my_partnership_state() to authenticated;
grant execute on function public.create_support_request(text) to authenticated;
grant execute on function public.acknowledge_support_request(uuid) to authenticated;
grant execute on function public.close_support_request(uuid) to authenticated;

revoke insert, update, delete on public.partnerships from public, anon, authenticated;
revoke insert, update, delete on public.support_requests from public, anon, authenticated;

commit;
