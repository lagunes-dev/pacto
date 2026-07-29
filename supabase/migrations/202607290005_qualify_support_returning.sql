begin;

-- Hosted projects may already have the profile-bootstrap lifecycle functions.
-- Recreate every support RPC so RETURNING cannot resolve against OUT parameters.
alter table public.support_requests add column if not exists closed_at timestamptz;

drop function if exists public.create_support_request(text);
create function public.create_support_request(request_type text)
returns table (support_request_id uuid, requester_id uuid, support_type text,
  support_status public.support_status, created_at timestamptz,
  acknowledged_at timestamptz, closed_at timestamptz)
language plpgsql security definer set search_path = ''
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
  returning public.support_requests.id, public.support_requests.requester_id,
    public.support_requests.support_type, public.support_requests.status,
    public.support_requests.created_at, public.support_requests.acknowledged_at,
    public.support_requests.closed_at;
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
  if request_id is null then
    raise exception 'support request unavailable' using errcode = '22023';
  end if;

  return query
  update public.support_requests r
  set status = 'acknowledged', acknowledged_at = clock_timestamp()
  from public.partnerships p
  where r.id = request_id and p.id = r.partnership_id and p.status = 'active'
    and actor_id in (p.inviter_id, p.invitee_id) and actor_id <> r.requester_id
    and r.status = 'pending'
  returning r.id, r.requester_id, r.support_type, r.status, r.created_at,
    r.acknowledged_at, r.closed_at;

  if not found then
    raise exception 'support request unavailable' using errcode = '42501';
  end if;
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
  if request_id is null then
    raise exception 'support request unavailable' using errcode = '22023';
  end if;

  return query
  update public.support_requests r
  set status = 'closed', closed_at = clock_timestamp()
  from public.partnerships p
  where r.id = request_id and p.id = r.partnership_id and p.status = 'active'
    and actor_id in (p.inviter_id, p.invitee_id) and actor_id <> r.requester_id
    and r.status = 'acknowledged'
  returning r.id, r.requester_id, r.support_type, r.status, r.created_at,
    r.acknowledged_at, r.closed_at;

  if not found then
    raise exception 'support request unavailable' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.create_support_request(text), public.acknowledge_support_request(uuid), public.close_support_request(uuid) from public, anon, authenticated;
grant execute on function public.create_support_request(text), public.acknowledge_support_request(uuid), public.close_support_request(uuid) to authenticated;

commit;
