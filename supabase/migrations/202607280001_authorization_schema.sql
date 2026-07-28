begin;

create extension if not exists pgcrypto;

do $$ begin
  create type public.partnership_status as enum ('pending', 'active', 'paused', 'ended');
exception when duplicate_object then null;
end $$;
alter type public.partnership_status add value if not exists 'pending';
alter type public.partnership_status add value if not exists 'active';
alter type public.partnership_status add value if not exists 'paused';
alter type public.partnership_status add value if not exists 'ended';

do $$ begin
  create type public.habit_state as enum ('done', 'event', 'unset');
exception when duplicate_object then null;
end $$;
alter type public.habit_state add value if not exists 'done';
alter type public.habit_state add value if not exists 'event';
alter type public.habit_state add value if not exists 'unset';

do $$ begin
  create type public.support_status as enum ('pending', 'acknowledged', 'closed');
exception when duplicate_object then null;
end $$;
alter type public.support_status add value if not exists 'pending';
alter type public.support_status add value if not exists 'acknowledged';
alter type public.support_status add value if not exists 'closed';

-- Enum additions must commit before their values can be referenced later in the migration.
commit;
begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now()
);

create table if not exists public.partnerships (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid references public.profiles(id) on delete cascade,
  invite_code text not null unique,
  status public.partnership_status not null default 'pending',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (invitee_id is null or invitee_id <> inviter_id)
);

create table if not exists public.sharing_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  share_checkin_completed boolean not null default true,
  share_general_status boolean not null default true,
  share_habit_details boolean not null default false,
  share_craving_level boolean not null default false,
  share_percentages boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  no_threats boolean not null default true,
  ask_before_advice boolean not null default true,
  no_comparisons boolean not null default true,
  pause_allowed boolean not null default true,
  preferred_support text not null default 'Ask me before giving advice',
  updated_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  priority smallint not null default 1 check (priority between 1 and 3),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null default current_date,
  craving_level smallint check (craving_level between 1 and 5),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create table if not exists public.habit_entries (
  id uuid primary key default gen_random_uuid(),
  daily_entry_id uuid not null references public.daily_entries(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  state public.habit_state not null default 'unset',
  trigger text,
  alternative_used text,
  created_at timestamptz not null default now(),
  unique (daily_entry_id, goal_id)
);

create table if not exists public.private_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  daily_entry_id uuid references public.daily_entries(id) on delete cascade,
  body text not null check (char_length(body) <= 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.recovery_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trigger text not null,
  moment text not null,
  need text,
  alternative text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  support_type text not null constraint support_requests_type_length check (char_length(support_type) between 1 and 80),
  status public.support_status not null default 'pending',
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create table if not exists public.shared_daily_summaries (
  daily_entry_id uuid primary key references public.daily_entries(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  checkin_completed boolean not null default false,
  general_status text,
  habit_details jsonb,
  craving_level smallint constraint summaries_craving_range check (craving_level between 1 and 5),
  percentage numeric(5,2) constraint summaries_percentage_range check (percentage between 0 and 100),
  updated_at timestamptz not null default now()
);

create unique index if not exists daily_entries_id_user_idx
  on public.daily_entries (id, user_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.partnerships'::regclass and conname = 'partnerships_active_requires_invitee') then
    alter table public.partnerships add constraint partnerships_active_requires_invitee
      check (status <> 'active' or invitee_id is not null) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.support_requests'::regclass and conname = 'support_requests_type_length') then
    alter table public.support_requests add constraint support_requests_type_length
      check (char_length(support_type) between 1 and 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.shared_daily_summaries'::regclass and conname = 'summaries_craving_range') then
    alter table public.shared_daily_summaries add constraint summaries_craving_range
      check (craving_level between 1 and 5) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.shared_daily_summaries'::regclass and conname = 'summaries_percentage_range') then
    alter table public.shared_daily_summaries add constraint summaries_percentage_range
      check (percentage between 0 and 100) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.shared_daily_summaries'::regclass and conname = 'shared_daily_summaries_entry_owner_fk') then
    alter table public.shared_daily_summaries add constraint shared_daily_summaries_entry_owner_fk
      foreign key (daily_entry_id, owner_id) references public.daily_entries(id, user_id) on delete cascade not valid;
  end if;
  alter table public.partnerships validate constraint partnerships_active_requires_invitee;
  alter table public.support_requests validate constraint support_requests_type_length;
  alter table public.shared_daily_summaries validate constraint summaries_craving_range;
  alter table public.shared_daily_summaries validate constraint summaries_percentage_range;
  alter table public.shared_daily_summaries validate constraint shared_daily_summaries_entry_owner_fk;
end $$;

create unique index if not exists one_active_partnership_per_inviter
  on public.partnerships (inviter_id) where status in ('pending', 'active', 'paused');
create unique index if not exists one_active_partnership_per_invitee
  on public.partnerships (invitee_id) where status in ('active', 'paused');
create index if not exists goals_owner_idx on public.goals (user_id);
create index if not exists daily_entries_owner_date_idx on public.daily_entries (user_id, entry_date desc);
create index if not exists private_notes_owner_idx on public.private_notes (user_id);
create index if not exists support_requests_partnership_idx on public.support_requests (partnership_id, created_at desc);

create or replace function public.reject_protected_column_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare protected_column text;
begin
  foreach protected_column in array tg_argv loop
    if to_jsonb(new) -> protected_column is distinct from to_jsonb(old) -> protected_column then
      raise exception 'protected column % cannot be changed', protected_column using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists profiles_identity_immutable on public.profiles;
create trigger profiles_identity_immutable before update on public.profiles
  for each row execute function public.reject_protected_column_update('id', 'created_at');
drop trigger if exists partnerships_identity_immutable on public.partnerships;
create trigger partnerships_identity_immutable before update on public.partnerships
  for each row execute function public.reject_protected_column_update('id', 'inviter_id', 'invitee_id', 'invite_code', 'created_at');
drop trigger if exists sharing_owner_immutable on public.sharing_preferences;
create trigger sharing_owner_immutable before update on public.sharing_preferences
  for each row execute function public.reject_protected_column_update('user_id');
drop trigger if exists communication_owner_immutable on public.communication_preferences;
create trigger communication_owner_immutable before update on public.communication_preferences
  for each row execute function public.reject_protected_column_update('user_id');
drop trigger if exists goals_owner_immutable on public.goals;
create trigger goals_owner_immutable before update on public.goals
  for each row execute function public.reject_protected_column_update('id', 'user_id', 'created_at');
drop trigger if exists daily_entries_owner_immutable on public.daily_entries;
create trigger daily_entries_owner_immutable before update on public.daily_entries
  for each row execute function public.reject_protected_column_update('id', 'user_id', 'created_at');
drop trigger if exists habit_entries_identity_immutable on public.habit_entries;
create trigger habit_entries_identity_immutable before update on public.habit_entries
  for each row execute function public.reject_protected_column_update('id', 'daily_entry_id', 'goal_id', 'created_at');
drop trigger if exists private_notes_owner_immutable on public.private_notes;
create trigger private_notes_owner_immutable before update on public.private_notes
  for each row execute function public.reject_protected_column_update('id', 'user_id', 'daily_entry_id', 'created_at');
drop trigger if exists recovery_plans_owner_immutable on public.recovery_plans;
create trigger recovery_plans_owner_immutable before update on public.recovery_plans
  for each row execute function public.reject_protected_column_update('id', 'user_id', 'created_at');
drop trigger if exists support_requests_identity_immutable on public.support_requests;
create trigger support_requests_identity_immutable before update on public.support_requests
  for each row execute function public.reject_protected_column_update('id', 'requester_id', 'partnership_id', 'created_at');
drop trigger if exists summaries_owner_immutable on public.shared_daily_summaries;
create trigger summaries_owner_immutable before update on public.shared_daily_summaries
  for each row execute function public.reject_protected_column_update('daily_entry_id', 'owner_id');

create or replace function public.initialize_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), nullif(split_part(new.email, '@', 1), ''), 'User'), 60))
  on conflict (id) do nothing;
  insert into public.sharing_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.communication_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists initialize_pacto_user on auth.users;
create trigger initialize_pacto_user after insert on auth.users
  for each row execute function public.initialize_user_profile();

insert into public.profiles (id, display_name)
select id, left(coalesce(nullif(raw_user_meta_data ->> 'display_name', ''), nullif(split_part(email, '@', 1), ''), 'User'), 60)
from auth.users on conflict (id) do nothing;
insert into public.sharing_preferences (user_id) select id from public.profiles on conflict (user_id) do nothing;
insert into public.communication_preferences (user_id) select id from public.profiles on conflict (user_id) do nothing;

revoke all on function public.reject_protected_column_update() from public, anon, authenticated;
revoke all on function public.initialize_user_profile() from public, anon, authenticated;

commit;
