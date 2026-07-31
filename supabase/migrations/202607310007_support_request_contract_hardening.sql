begin;

alter table public.support_requests
  add column if not exists request_message text,
  add column if not exists response_type text;

alter table public.support_requests drop constraint if exists support_requests_request_message_length;
alter table public.support_requests add constraint support_requests_request_message_length check (
  request_message is null or char_length(request_message) between 1 and 160
);

alter table public.support_requests drop constraint if exists support_requests_response_type_allowlist;
alter table public.support_requests add constraint support_requests_response_type_allowlist check (
  response_type is null or response_type in ('available_now', 'available_later', 'here_with_you')
);

create index if not exists support_requests_partnership_idx
  on public.support_requests (partnership_id, created_at desc);

drop function if exists public.create_support_request(text);
drop function if exists public.create_support_request(text, text);

create function public.create_support_request(request_type text, optional_message text)
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
  if optional_message is not null and char_length(optional_message) not between 1 and 160 then
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

create function public.create_support_request(request_type text)
returns table (support_request_id uuid, requester_id uuid, support_type text,
  request_message text, response_type text, support_status public.support_status,
  created_at timestamptz, acknowledged_at timestamptz, closed_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  return query select * from public.create_support_request(request_type, null::text);
end;
$$;

revoke all on function public.create_support_request(text, text), public.create_support_request(text) from public, anon, authenticated;
grant execute on function public.create_support_request(text, text), public.create_support_request(text) to authenticated;

commit;
