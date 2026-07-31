begin;

drop function if exists public.get_progress_cooperation();
create function public.get_progress_cooperation()
returns table (
  checkins_completed bigint,
  support_requests_responded bigint,
  reviews_completed bigint
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  active_partnership public.partnerships%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select p.* into active_partnership
  from public.partnerships p
  where p.status = 'active'
    and actor_id in (p.inviter_id, p.invitee_id)
  limit 1;

  if not found then return; end if;

  return query
  select
    (
      select count(*)
      from public.daily_entries d
      join public.sharing_preferences permission on permission.user_id = d.user_id
      where d.user_id in (active_partnership.inviter_id, active_partnership.invitee_id)
        and d.entry_date >= current_date - 6
        and d.completed_at is not null
        and permission.share_checkin_completed
    ),
    (
      select count(*)
      from public.support_requests request
      where request.partnership_id = active_partnership.id
        and request.acknowledged_at >= current_date - 6
    ),
    (
      select count(*)
      from public.weekly_review_records review
      join public.sharing_preferences permission on permission.user_id = review.user_id
      where review.user_id in (active_partnership.inviter_id, active_partnership.invitee_id)
        and review.week_start >= current_date - 6
        and permission.share_general_status
    );
end;
$$;

revoke all on function public.get_progress_cooperation() from public, anon, authenticated;
grant execute on function public.get_progress_cooperation() to authenticated;

commit;
