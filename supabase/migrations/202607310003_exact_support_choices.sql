begin;

alter table public.support_requests
  add column if not exists request_message text,
  add column if not exists response_type text;

update public.support_requests set support_type = case support_type
  when 'encouragement' then 'motivation'
  when 'check_in' then 'conversation'
  when 'practical_help' then 'food_choice'
  when 'distraction' then 'distraction'
  when 'food_choice' then 'food_choice'
  when 'motivation' then 'motivation'
  when 'conversation' then 'conversation'
  when 'presence_no_advice' then 'presence_no_advice'
  else 'conversation' end;

alter table public.support_requests drop constraint if exists support_requests_exact_type;
alter table public.support_requests add constraint support_requests_exact_type check (
  support_type in ('distraction', 'food_choice', 'motivation', 'conversation', 'presence_no_advice')
);
alter table public.support_requests drop constraint if exists support_requests_message_allowlist;
alter table public.support_requests add constraint support_requests_message_allowlist check (
  request_message is null or request_message in ('not_urgent', 'when_available', 'no_reply_needed')
);
alter table public.support_requests drop constraint if exists support_requests_response_allowlist;
alter table public.support_requests add constraint support_requests_response_allowlist check (
  response_type is null or response_type in ('available_now', 'available_later', 'here_with_you')
);

drop function if exists public.create_support_request(text);
create function public.create_support_request(request_type text, optional_message text default null)
returns table (support_request_id uuid, requester_id uuid, support_type text,
  request_message text, response_type text, support_status public.support_status,
  created_at timestamptz, acknowledged_at timestamptz, closed_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := private.require_actor();
  partnership_id uuid := private.active_partnership_id();
begin
  if request_type is null or request_type not in ('distraction', 'food_choice', 'motivation', 'conversation', 'presence_no_advice') then
    raise exception 'invalid support type' using errcode = '22023';
  end if;
  if optional_message is not null and optional_message not in ('not_urgent', 'when_available', 'no_reply_needed') then
    raise exception 'invalid support message' using errcode = '22023';
  end if;

  return query insert into public.support_requests (requester_id, partnership_id, support_type, request_message)
    values (actor_id, partnership_id, request_type, optional_message)
    returning public.support_requests.id, public.support_requests.requester_id,
      public.support_requests.support_type, public.support_requests.request_message,
      public.support_requests.response_type, public.support_requests.status,
      public.support_requests.created_at, public.support_requests.acknowledged_at,
      public.support_requests.closed_at;
end;
$$;

drop function if exists public.acknowledge_support_request(uuid);
create function public.acknowledge_support_request(request_id uuid, selected_response text)
returns table (support_request_id uuid, requester_id uuid, support_type text,
  request_message text, response_type text, support_status public.support_status,
  created_at timestamptz, acknowledged_at timestamptz, closed_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := private.require_actor();
begin
  if request_id is null or selected_response is null or selected_response not in ('available_now', 'available_later', 'here_with_you') then
    raise exception 'support request unavailable' using errcode = '22023';
  end if;
  return query update public.support_requests r
    set status = 'acknowledged', acknowledged_at = clock_timestamp(), response_type = selected_response
    from public.partnerships p
    where r.id = request_id and p.id = r.partnership_id and p.status = 'active'
      and actor_id in (p.inviter_id, p.invitee_id) and actor_id <> r.requester_id and r.status = 'pending'
    returning r.id, r.requester_id, r.support_type, r.request_message, r.response_type,
      r.status, r.created_at, r.acknowledged_at, r.closed_at;
  if not found then raise exception 'support request unavailable' using errcode = '42501'; end if;
end;
$$;

drop function if exists public.close_support_request(uuid);
create function public.close_support_request(request_id uuid)
returns table (support_request_id uuid, requester_id uuid, support_type text,
  request_message text, response_type text, support_status public.support_status,
  created_at timestamptz, acknowledged_at timestamptz, closed_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid := private.require_actor();
begin
  if request_id is null then raise exception 'support request unavailable' using errcode = '22023'; end if;
  return query update public.support_requests r set status = 'closed', closed_at = clock_timestamp()
    from public.partnerships p
    where r.id = request_id and p.id = r.partnership_id and p.status = 'active'
      and actor_id in (p.inviter_id, p.invitee_id) and actor_id <> r.requester_id and r.status = 'acknowledged'
    returning r.id, r.requester_id, r.support_type, r.request_message, r.response_type,
      r.status, r.created_at, r.acknowledged_at, r.closed_at;
  if not found then raise exception 'support request unavailable' using errcode = '42501'; end if;
end;
$$;

revoke all on function public.create_support_request(text, text), public.acknowledge_support_request(uuid, text), public.close_support_request(uuid) from public, anon, authenticated;
grant execute on function public.create_support_request(text, text), public.acknowledge_support_request(uuid, text), public.close_support_request(uuid) to authenticated;

commit;
