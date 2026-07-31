begin;

alter table public.recovery_plans add column if not exists operation_id uuid;
alter table public.recovery_plans add column if not exists request_hash text;
alter table public.recovery_plans add column if not exists revision integer not null default 1;
alter table public.recovery_plans add column if not exists updated_at timestamptz not null default now();
create unique index if not exists recovery_plans_owner_operation_idx
  on public.recovery_plans (user_id, operation_id) where operation_id is not null;
create index if not exists recovery_plans_owner_revision_idx
  on public.recovery_plans (user_id, revision desc);

alter table public.private_notes add column if not exists recovery_plan_id uuid;
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.private_notes'::regclass
      and conname = 'private_notes_recovery_plan_fk'
  ) then
    alter table public.private_notes add constraint private_notes_recovery_plan_fk
      foreign key (recovery_plan_id) references public.recovery_plans(id) on delete cascade not valid;
  end if;
  alter table public.private_notes validate constraint private_notes_recovery_plan_fk;
end $$;

create table if not exists public.recovery_event_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  recovery_plan_id uuid not null references public.recovery_plans(id) on delete cascade,
  revision integer not null check (revision > 0),
  trigger text not null check (char_length(trigger) between 1 and 200),
  moment text not null check (char_length(moment) between 1 and 200),
  need text not null check (char_length(need) between 1 and 500),
  alternative text not null check (char_length(alternative) between 1 and 500),
  recorded_at timestamptz not null default now(),
  unique (user_id, recovery_plan_id, revision)
);

create table if not exists public.weekly_review_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  revision integer not null default 1 check (revision > 0),
  reflection text not null check (char_length(reflection) between 1 and 2000),
  next_step text not null check (char_length(next_step) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start, revision)
);

create index if not exists recovery_events_owner_time_idx
  on public.recovery_event_records (user_id, recorded_at desc);
create index if not exists weekly_reviews_owner_week_idx
  on public.weekly_review_records (user_id, week_start desc);

alter table public.recovery_event_records enable row level security;
alter table public.recovery_event_records force row level security;
alter table public.weekly_review_records enable row level security;
alter table public.weekly_review_records force row level security;
revoke all on public.recovery_event_records, public.weekly_review_records from public, anon, authenticated;

drop policy if exists recovery_events_owner_select on public.recovery_event_records;
create policy recovery_events_owner_select on public.recovery_event_records for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists weekly_reviews_owner_select on public.weekly_review_records;
create policy weekly_reviews_owner_select on public.weekly_review_records for select to authenticated
  using (user_id = (select auth.uid()));

drop trigger if exists recovery_events_identity_immutable on public.recovery_event_records;
create trigger recovery_events_identity_immutable before update on public.recovery_event_records
  for each row execute function public.reject_protected_column_update(
    'id', 'user_id', 'recovery_plan_id', 'revision', 'recorded_at'
  );
drop trigger if exists weekly_reviews_identity_immutable on public.weekly_review_records;
create trigger weekly_reviews_identity_immutable before update on public.weekly_review_records
  for each row execute function public.reject_protected_column_update(
    'id', 'user_id', 'week_start', 'revision', 'created_at'
  );

drop function if exists public.save_recovery_record(uuid, integer, text, text, text, text, text);
create function public.save_recovery_record(
  p_operation_id uuid,
  p_expected_revision integer,
  p_trigger text,
  p_moment text,
  p_need text,
  p_alternative text,
  p_private_note text default null
)
returns table (
  id uuid,
  revision integer,
  trigger text,
  moment text,
  need text,
  alternative text,
  note_present boolean,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_hash text;
  v_current_revision integer;
  v_existing public.recovery_plans%rowtype;
  v_plan public.recovery_plans%rowtype;
  v_recorded_at timestamptz := clock_timestamp();
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_operation_id is null then raise exception 'Operation ID is required' using errcode = '22023'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected revision must be zero or greater' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_trigger, ''))) not between 1 and 200
    or char_length(trim(coalesce(p_moment, ''))) not between 1 and 200
    or char_length(trim(coalesce(p_need, ''))) not between 1 and 500
    or char_length(trim(coalesce(p_alternative, ''))) not between 1 and 500
    or char_length(coalesce(p_private_note, '')) > 4000 then
    raise exception 'Recovery record is invalid' using errcode = '22023';
  end if;

  v_hash := md5(jsonb_build_object(
    'trigger', trim(p_trigger), 'moment', trim(p_moment), 'need', trim(p_need),
    'alternative', trim(p_alternative), 'private_note', nullif(trim(coalesce(p_private_note, '')), '')
  )::text);

  select * into v_existing from public.recovery_plans
  where user_id = v_actor and operation_id = p_operation_id;
  if found then
    if v_existing.request_hash <> v_hash then
      raise exception 'Operation ID was already used with a different payload' using errcode = '22023';
    end if;
    return query select v_existing.id, v_existing.revision, v_existing.trigger,
      v_existing.moment, v_existing.need, v_existing.alternative,
      exists(select 1 from public.private_notes n where n.recovery_plan_id = v_existing.id),
      v_existing.created_at;
    return;
  end if;

  perform 1 from public.recovery_plans where user_id = v_actor for update;
  select coalesce(max(r.revision), 0) into v_current_revision
  from public.recovery_plans r where r.user_id = v_actor;
  if p_expected_revision <> v_current_revision then
    raise exception 'Recovery revision conflict' using errcode = '40001';
  end if;

  update public.recovery_plans set active = false, updated_at = v_recorded_at
  where user_id = v_actor and active;
  insert into public.recovery_plans (
    user_id, operation_id, request_hash, revision, trigger, moment, need,
    alternative, active, created_at, updated_at
  ) values (
    v_actor, p_operation_id, v_hash, v_current_revision + 1, trim(p_trigger),
    trim(p_moment), trim(p_need), trim(p_alternative), true, v_recorded_at, v_recorded_at
  ) returning * into v_plan;

  insert into public.recovery_event_records (
    user_id, recovery_plan_id, revision, trigger, moment, need, alternative, recorded_at
  ) values (
    v_actor, v_plan.id, v_plan.revision, v_plan.trigger, v_plan.moment,
    v_plan.need, v_plan.alternative, v_recorded_at
  );
  if nullif(trim(coalesce(p_private_note, '')), '') is not null then
    insert into public.private_notes (user_id, recovery_plan_id, body, created_at)
    values (v_actor, v_plan.id, trim(p_private_note), v_recorded_at);
  end if;

  return query select v_plan.id, v_plan.revision, v_plan.trigger, v_plan.moment,
    v_plan.need, v_plan.alternative,
    nullif(trim(coalesce(p_private_note, '')), '') is not null, v_recorded_at;
end;
$$;

revoke insert, update, delete on public.recovery_plans, public.private_notes from authenticated;
grant select on public.recovery_plans, public.private_notes,
  public.recovery_event_records, public.weekly_review_records to authenticated;
revoke all on function public.save_recovery_record(uuid, integer, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_recovery_record(uuid, integer, text, text, text, text, text)
  to authenticated;

commit;
