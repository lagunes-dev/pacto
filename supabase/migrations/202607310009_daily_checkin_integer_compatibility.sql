begin;

-- Preserve the existing smallint API while accepting PostgreSQL's default
-- integer literal resolution used by the daily check-in contract.
drop function if exists public.save_daily_checkin(text, integer, jsonb);
create function public.save_daily_checkin(p_timezone text, p_craving_level integer, p_habits jsonb)
returns table (id uuid, entry_date date, craving_level smallint, completed_at timestamptz, habits jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_craving_level not between 1 and 5 then
    raise exception 'Craving level must be between 1 and 5';
  end if;

  return query
  select * from public.save_daily_checkin(
    p_timezone, p_craving_level::smallint, p_habits
  );
end;
$$;

revoke all on function public.save_daily_checkin(text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_daily_checkin(text, integer, jsonb) to authenticated;

commit;
