-- Pacto · esquema de referencia para Supabase/PostgreSQL
-- Ejecutar en un proyecto nuevo. Requiere Supabase Auth.

create extension if not exists pgcrypto;

create type public.partnership_status as enum ('pending','active','paused','ended');
create type public.habit_state as enum ('done','event','unset');
create type public.support_status as enum ('pending','acknowledged','closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now()
);

create table public.partnerships (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid references public.profiles(id) on delete cascade,
  invite_code text not null unique,
  status public.partnership_status not null default 'pending',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  check (invitee_id is null or invitee_id <> inviter_id)
);

create unique index one_active_partnership_per_inviter
  on public.partnerships(inviter_id) where status in ('pending','active','paused');
create unique index one_active_partnership_per_invitee
  on public.partnerships(invitee_id) where status in ('active','paused');

create table public.sharing_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  share_checkin_completed boolean not null default true,
  share_general_status boolean not null default true,
  share_habit_details boolean not null default false,
  share_craving_level boolean not null default false,
  share_percentages boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.communication_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  no_threats boolean not null default true,
  ask_before_advice boolean not null default true,
  no_comparisons boolean not null default true,
  pause_allowed boolean not null default true,
  preferred_support text not null default 'Pregúntame antes de aconsejar',
  updated_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  priority smallint not null default 1 check (priority between 1 and 3),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null default current_date,
  craving_level smallint check (craving_level between 1 and 5),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, entry_date)
);

create table public.habit_entries (
  id uuid primary key default gen_random_uuid(),
  daily_entry_id uuid not null references public.daily_entries(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  state public.habit_state not null default 'unset',
  trigger text,
  alternative_used text,
  created_at timestamptz not null default now(),
  unique(daily_entry_id, goal_id)
);

-- Separada deliberadamente: nunca se consulta desde políticas de pareja.
create table public.private_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  daily_entry_id uuid references public.daily_entries(id) on delete cascade,
  body text not null check (char_length(body) <= 4000),
  created_at timestamptz not null default now()
);

create table public.recovery_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  trigger text not null,
  moment text not null,
  need text,
  alternative text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  support_type text not null,
  status public.support_status not null default 'pending',
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

-- Vista materializada por aplicación: sólo contiene campos autorizados.
create table public.shared_daily_summaries (
  daily_entry_id uuid primary key references public.daily_entries(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  checkin_completed boolean not null default false,
  general_status text,
  habit_details jsonb,
  craving_level smallint,
  percentage numeric(5,2),
  updated_at timestamptz not null default now()
);

create or replace function public.is_active_partner(owner uuid, viewer uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.partnerships p
    where p.status='active'
      and ((p.inviter_id=owner and p.invitee_id=viewer)
        or (p.invitee_id=owner and p.inviter_id=viewer))
  );
$$;

alter table public.profiles enable row level security;
alter table public.partnerships enable row level security;
alter table public.sharing_preferences enable row level security;
alter table public.communication_preferences enable row level security;
alter table public.goals enable row level security;
alter table public.daily_entries enable row level security;
alter table public.habit_entries enable row level security;
alter table public.private_notes enable row level security;
alter table public.recovery_plans enable row level security;
alter table public.support_requests enable row level security;
alter table public.shared_daily_summaries enable row level security;

create policy profiles_self_select on public.profiles for select using (id=auth.uid());
create policy profiles_partner_select on public.profiles for select using (public.is_active_partner(id,auth.uid()));
create policy profiles_self_write on public.profiles for all using (id=auth.uid()) with check (id=auth.uid());

create policy partnerships_members_select on public.partnerships for select using (auth.uid() in (inviter_id,invitee_id));
create policy partnerships_inviter_insert on public.partnerships for insert with check (inviter_id=auth.uid() and invitee_id is null);
create policy partnerships_members_update on public.partnerships for update using (auth.uid() in (inviter_id,invitee_id));

create policy sharing_self_only on public.sharing_preferences for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy communication_self_only on public.communication_preferences for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy goals_self_only on public.goals for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy daily_self_only on public.daily_entries for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy habit_via_owned_daily on public.habit_entries for all using (
  exists(select 1 from public.daily_entries d where d.id=daily_entry_id and d.user_id=auth.uid())
) with check (
  exists(select 1 from public.daily_entries d where d.id=daily_entry_id and d.user_id=auth.uid())
);
create policy private_notes_self_only on public.private_notes for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy recovery_self_only on public.recovery_plans for all using (user_id=auth.uid()) with check (user_id=auth.uid());

create policy support_members_select on public.support_requests for select using (
  requester_id=auth.uid() or exists(
    select 1 from public.partnerships p where p.id=partnership_id and auth.uid() in (p.inviter_id,p.invitee_id)
  )
);
create policy support_requester_insert on public.support_requests for insert with check (
  requester_id=auth.uid() and exists(
    select 1 from public.partnerships p where p.id=partnership_id and p.status='active' and auth.uid() in (p.inviter_id,p.invitee_id)
  )
);
create policy support_members_update on public.support_requests for update using (
  exists(select 1 from public.partnerships p where p.id=partnership_id and auth.uid() in (p.inviter_id,p.invitee_id))
);

create policy summaries_owner_all on public.shared_daily_summaries for all using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy summaries_partner_read on public.shared_daily_summaries for select using (
  public.is_active_partner(owner_id,auth.uid())
);

-- Nota de implementación:
-- La aplicación debe construir shared_daily_summaries usando sharing_preferences.

-- Revocation-safe, owner-only Realtime signal. The application treats this as
-- a cache invalidation event, never as authoritative partnership data.
create table public.partnership_realtime_state (
  recipient_id uuid primary key references public.profiles(id) on delete cascade,
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  status text not null check (status in ('pending','active','paused','ended')),
  updated_at timestamptz not null default now()
);
alter table public.partnership_realtime_state enable row level security;
alter table public.partnership_realtime_state force row level security;
create policy partnership_realtime_state_owner_select on public.partnership_realtime_state
  for select using (recipient_id=(select auth.uid()));
revoke all on public.partnership_realtime_state from anon, authenticated;
grant select on public.partnership_realtime_state to authenticated;

create or replace function public.sync_partnership_realtime_state()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.partnership_realtime_state(recipient_id,partnership_id,status,updated_at)
  select recipient_id,new.id,new.status,now()
  from (values(new.inviter_id),(new.invitee_id)) recipients(recipient_id)
  where recipient_id is not null
  on conflict(recipient_id) do update set partnership_id=excluded.partnership_id,
    status=excluded.status,updated_at=excluded.updated_at;
  delete from public.partnership_realtime_state where partnership_id=new.id
    and recipient_id<>new.inviter_id
    and (new.invitee_id is null or recipient_id<>new.invitee_id);
  return new;
end;
$$;
revoke all on function public.sync_partnership_realtime_state() from public, anon, authenticated;
create trigger sync_partnership_realtime_state_trigger
after insert or update of invitee_id,status on public.partnerships
for each row execute function public.sync_partnership_realtime_state();
-- Nunca copie private_notes a esa tabla y nunca permita escrituras de la pareja sobre datos del propietario.
