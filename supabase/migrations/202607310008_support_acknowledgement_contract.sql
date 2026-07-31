begin;

drop function if exists public.acknowledge_support_request(uuid);
drop function if exists public.acknowledge_support_request(uuid, text);

create function public.acknowledge_support_request(request_id uuid, response_type text)
returns table (support_request_id uuid, requester_id uuid, support_type text,
  request_message text, response_type text, support_status public.support_status,
  created_at timestamptz, acknowledged_at timestamptz, closed_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := private.require_actor();
begin
  if request_id is null or response_type is null
     or response_type not in ('available_now', 'available_later', 'here_with_you') then
    raise exception 'support request unavailable' using errcode = '22023';
  end if;
  return query update public.support_requests r
    set status = 'acknowledged', acknowledged_at = clock_timestamp(),
        response_type = acknowledge_support_request.response_type
    from public.partnerships p
    where r.id = request_id and p.id = r.partnership_id and p.status = 'active'
      and actor_id in (p.inviter_id, p.invitee_id) and actor_id <> r.requester_id
      and r.status = 'pending'
    returning r.id, r.requester_id, r.support_type, r.request_message,
      r.response_type, r.status, r.created_at, r.acknowledged_at, r.closed_at;
  if not found then raise exception 'support request unavailable' using errcode = '42501'; end if;
end;
$$;

create function public.acknowledge_support_request(request_id uuid)
returns table (support_request_id uuid, requester_id uuid, support_type text,
  request_message text, response_type text, support_status public.support_status,
  created_at timestamptz, acknowledged_at timestamptz, closed_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  return query select * from public.acknowledge_support_request(request_id, 'available_now'::text);
end;
$$;

revoke all on function public.acknowledge_support_request(uuid, text), public.acknowledge_support_request(uuid) from public, anon, authenticated;
grant execute on function public.acknowledge_support_request(uuid, text), public.acknowledge_support_request(uuid) to authenticated;

commit;
