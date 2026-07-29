begin;

-- Dashboard-created Auth users can predate the profile trigger. Bootstrap only
-- rows needed by the authenticated lifecycle operation; never return email data.
create or replace function private.ensure_profile(profile_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_email text;
  metadata_name text;
begin
  if profile_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select u.email, u.raw_user_meta_data ->> 'display_name'
    into user_email, metadata_name
  from auth.users u
  where u.id = profile_user_id;

  if not found then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  insert into public.profiles (id, display_name)
  values (
    profile_user_id,
    left(coalesce(nullif(btrim(metadata_name), ''), nullif(split_part(user_email, '@', 1), ''), 'User'), 60)
  )
  on conflict (id) do nothing;

  insert into public.sharing_preferences (user_id) values (profile_user_id)
  on conflict (user_id) do nothing;
  insert into public.communication_preferences (user_id) values (profile_user_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function private.ensure_profile(uuid) from public, anon, authenticated;

drop function if exists public.create_partnership_invite(text);
create function public.create_partnership_invite(target_email text)
returns table (
  partnership_id uuid,
  invite_code text,
  partnership_status public.partnership_status,
  created_at timestamptz,
  expires_at timestamptz
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

  perform private.ensure_profile(actor_id);
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

  perform private.ensure_profile(target_id);
  return query
  insert into public.partnerships (inviter_id, invitee_id, invite_code, status)
  values (actor_id, target_id, encode(extensions.gen_random_bytes(18), 'hex'), 'pending')
  returning partnerships.id, partnerships.invite_code, partnerships.status,
    partnerships.created_at, partnerships.created_at + interval '1 day';
exception
  when unique_violation then
    raise exception 'invite unavailable' using errcode = 'P0001';
end;
$$;

revoke all on function public.create_partnership_invite(text) from public, anon, authenticated;
grant execute on function public.create_partnership_invite(text) to authenticated;

-- Reassert the complete DTO in case the hosted chain stopped before 003.
alter table public.support_requests add column if not exists closed_at timestamptz;

drop function if exists public.create_support_request(text);
create function public.create_support_request(request_type text)
returns table (support_request_id uuid, requester_id uuid, support_type text,
  support_status public.support_status, created_at timestamptz,
  acknowledged_at timestamptz, closed_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := private.require_actor(); partnership_id uuid := private.active_partnership_id(); normalized_type text := btrim(request_type);
begin
  if request_type is null or char_length(normalized_type) not between 1 and 80 then raise exception 'invalid support type' using errcode = '22023'; end if;
  return query insert into public.support_requests (requester_id, partnership_id, support_type)
    values (actor_id, partnership_id, normalized_type)
    returning id, requester_id, support_type, status, created_at, acknowledged_at, closed_at;
end;
$$;

drop function if exists public.acknowledge_support_request(uuid);
create function public.acknowledge_support_request(request_id uuid)
returns table (support_request_id uuid, requester_id uuid, support_type text,
  support_status public.support_status, created_at timestamptz,
  acknowledged_at timestamptz, closed_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := private.require_actor();
begin
  if request_id is null then raise exception 'support request unavailable' using errcode = '22023'; end if;
  return query update public.support_requests r
    set status = 'acknowledged', acknowledged_at = clock_timestamp()
    from public.partnerships p
    where r.id = request_id and p.id = r.partnership_id and p.status = 'active'
      and actor_id in (p.inviter_id, p.invitee_id) and actor_id <> r.requester_id and r.status = 'pending'
    returning r.id, r.requester_id, r.support_type, r.status, r.created_at, r.acknowledged_at, r.closed_at;
  if not found then raise exception 'support request unavailable' using errcode = '42501'; end if;
end;
$$;

drop function if exists public.close_support_request(uuid);
create function public.close_support_request(request_id uuid)
returns table (support_request_id uuid, requester_id uuid, support_type text,
  support_status public.support_status, created_at timestamptz,
  acknowledged_at timestamptz, closed_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := private.require_actor();
begin
  if request_id is null then raise exception 'support request unavailable' using errcode = '22023'; end if;
  return query update public.support_requests r
    set status = 'closed', closed_at = clock_timestamp()
    from public.partnerships p
    where r.id = request_id and p.id = r.partnership_id and p.status = 'active'
      and actor_id in (p.inviter_id, p.invitee_id) and actor_id <> r.requester_id and r.status = 'acknowledged'
    returning r.id, r.requester_id, r.support_type, r.status, r.created_at, r.acknowledged_at, r.closed_at;
  if not found then raise exception 'support request unavailable' using errcode = '42501'; end if;
end;
$$;

revoke all on function public.create_support_request(text), public.acknowledge_support_request(uuid), public.close_support_request(uuid) from public, anon, authenticated;
grant execute on function public.create_support_request(text), public.acknowledge_support_request(uuid), public.close_support_request(uuid) to authenticated;

commit;
