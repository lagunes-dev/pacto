begin;

drop function if exists public.save_daily_checkin(text, smallint, jsonb);
create function public.save_daily_checkin(p_timezone text, p_craving_level smallint, p_habits jsonb)
returns table (id uuid, entry_date date, craving_level smallint, completed_at timestamptz, habits jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_timezone text;
  v_entry_date date;
  v_entry_id uuid;
  v_completed_at timestamptz := clock_timestamp();
  v_submitted_count integer;
  v_active_count integer;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_craving_level not between 1 and 5 then raise exception 'Craving level must be between 1 and 5'; end if;
  if jsonb_typeof(p_habits) <> 'array' or jsonb_array_length(p_habits) = 0 then
    raise exception 'At least one habit answer is required';
  end if;

  select nullif(trim(p.timezone), '') into v_timezone from public.profiles p where p.id = v_actor;
  v_timezone := coalesce(v_timezone, nullif(trim(p_timezone), ''), 'America/Mexico_City');
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception 'Invalid IANA timezone';
  end if;
  v_entry_date := (v_completed_at at time zone v_timezone)::date;

  create temporary table if not exists checkin_answers (
    goal_id uuid primary key,
    state public.habit_state not null,
    trigger text
  ) on commit drop;
  truncate pg_temp.checkin_answers;
  insert into pg_temp.checkin_answers (goal_id, state, trigger)
  select answer.goal_id, answer.state::public.habit_state, answer.trigger
  from jsonb_to_recordset(p_habits) as answer(goal_id uuid, state text, trigger text);

  get diagnostics v_submitted_count = row_count;
  if v_submitted_count <> jsonb_array_length(p_habits) then raise exception 'Each goal can appear only once'; end if;
  if exists (
    select 1 from pg_temp.checkin_answers a
    where a.state not in ('done', 'event')
      or (a.state = 'done' and a.trigger is not null)
      or (a.state = 'event' and a.trigger not in (
        'Antojo', 'Comida social', 'No había alternativa', 'Hambre', 'Estrés', 'Costumbre'
      ))
  ) then raise exception 'Habit answer is invalid'; end if;
  if exists (
    select 1 from pg_temp.checkin_answers a
    left join public.goals g on g.id = a.goal_id and g.user_id = v_actor and g.active
    where g.id is null
  ) then raise exception 'Habit snapshot contains an unavailable goal'; end if;
  select count(*) into v_active_count from public.goals g where g.user_id = v_actor and g.active;
  if v_submitted_count <> v_active_count then raise exception 'Every active goal requires an answer'; end if;

  insert into public.daily_entries as daily (user_id, entry_date, craving_level, completed_at, updated_at)
  values (v_actor, v_entry_date, p_craving_level, v_completed_at, v_completed_at)
  on conflict (user_id, entry_date) do update
    set craving_level = excluded.craving_level,
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at
  returning daily.id into v_entry_id;

  delete from public.habit_entries h
  where h.daily_entry_id = v_entry_id
    and not exists (select 1 from pg_temp.checkin_answers a where a.goal_id = h.goal_id);
  insert into public.habit_entries as habit (daily_entry_id, goal_id, state, trigger)
  select v_entry_id, a.goal_id, a.state, a.trigger from pg_temp.checkin_answers a
  on conflict (daily_entry_id, goal_id) do update set state = excluded.state, trigger = excluded.trigger;

  return query
  select d.id, d.entry_date, d.craving_level, d.completed_at,
    coalesce(jsonb_agg(jsonb_build_object(
      'goal_id', h.goal_id, 'state', h.state, 'trigger', h.trigger
    ) order by h.goal_id) filter (where h.id is not null), '[]'::jsonb)
  from public.daily_entries d
  left join public.habit_entries h on h.daily_entry_id = d.id
  where d.id = v_entry_id and d.user_id = v_actor
  group by d.id, d.entry_date, d.craving_level, d.completed_at;
end;
$$;

revoke all on function public.save_daily_checkin(text, smallint, jsonb) from public, anon, authenticated;
grant execute on function public.save_daily_checkin(text, smallint, jsonb) to authenticated;

commit;
