alter table public.partnerships
  add column if not exists resume_requested_by uuid references public.profiles(id);

drop function if exists public.get_my_partnership_state();
create function public.get_my_partnership_state()
returns table (
  partnership_id uuid,
  partnership_status public.partnership_status,
  member_role text,
  partner_id uuid,
  accepted_at timestamptz,
  created_at timestamptz,
  resume_requested_by uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
    p.status,
    case when p.inviter_id = private.require_actor() then 'inviter' else 'invitee' end,
    case when p.status <> 'active' then null
      when p.inviter_id = private.require_actor() then p.invitee_id else p.inviter_id end,
    p.accepted_at,
    p.created_at,
    p.resume_requested_by
  from public.partnerships p
  where private.require_actor() in (p.inviter_id, p.invitee_id)
  order by (p.status <> 'ended') desc, p.accepted_at desc nulls last, p.created_at desc, p.id desc
  limit 1
$$;

create or replace function public.request_partnership_resume()
returns table (partnership_id uuid, partnership_status public.partnership_status, resume_requested_by uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.require_actor();
begin
  return query
  update public.partnerships p
  set resume_requested_by = actor_id
  where actor_id in (p.inviter_id, p.invitee_id)
    and p.status = 'paused'
    and (p.resume_requested_by is null or p.resume_requested_by = actor_id)
  returning p.id, p.status, p.resume_requested_by;
  if not found then raise exception 'paused partnership required' using errcode = '42501'; end if;
end;
$$;

create or replace function public.confirm_partnership_resume()
returns table (partnership_id uuid, partnership_status public.partnership_status)
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := private.require_actor();
begin
  return query
  update public.partnerships p
  set status = 'active', resume_requested_by = null
  where actor_id in (p.inviter_id, p.invitee_id)
    and p.status = 'paused'
    and p.resume_requested_by is not null
    and p.resume_requested_by <> actor_id
  returning p.id, p.status;
  if not found then raise exception 'partner confirmation required' using errcode = '42501'; end if;
end;
$$;

revoke all on function public.get_my_partnership_state() from public, anon;
revoke all on function public.request_partnership_resume() from public, anon;
revoke all on function public.confirm_partnership_resume() from public, anon;
grant execute on function public.get_my_partnership_state() to authenticated;
grant execute on function public.request_partnership_resume() to authenticated;
grant execute on function public.confirm_partnership_resume() to authenticated;

create or replace function public.complete_onboarding(
  timezone_name text, goal_name text,
  share_checkin boolean, share_status boolean, share_habits boolean, share_craving boolean, share_rates boolean,
  boundary_no_threats boolean, boundary_ask_advice boolean, boundary_no_comparisons boolean, boundary_pause boolean,
  support_preference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := private.require_actor();
  created_goal uuid;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = timezone_name) then
    raise exception 'invalid timezone' using errcode = '22023';
  end if;
  if char_length(btrim(goal_name)) not between 1 and 80 or char_length(btrim(support_preference)) not between 1 and 160 then
    raise exception 'invalid onboarding input' using errcode = '22023';
  end if;

  update public.profiles set timezone = timezone_name where id = actor_id;
  update public.sharing_preferences set
    share_checkin_completed = share_checkin, share_general_status = share_status,
    share_habit_details = share_habits, share_craving_level = share_craving,
    share_percentages = share_rates, updated_at = now()
  where user_id = actor_id;
  update public.communication_preferences set
    no_threats = boundary_no_threats, ask_before_advice = boundary_ask_advice,
    no_comparisons = boundary_no_comparisons, pause_allowed = boundary_pause,
    preferred_support = btrim(support_preference), updated_at = now()
  where user_id = actor_id;
  insert into public.goals (user_id, name, priority)
  values (actor_id, btrim(goal_name), 1)
  returning id into created_goal;
  return created_goal;
end;
$$;

revoke all on function public.complete_onboarding(text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text) from public, anon;
grant execute on function public.complete_onboarding(text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,text) to authenticated;
