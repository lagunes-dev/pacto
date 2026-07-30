-- Owner-only signal used to close Realtime channels when active partnership rows
-- become invisible under active-only partnership RLS.
create table if not exists public.partnership_realtime_state (
  recipient_id uuid primary key references public.profiles(id) on delete cascade,
  partnership_id uuid not null references public.partnerships(id) on delete cascade,
  status text not null check (status in ('pending', 'active', 'paused', 'ended')),
  updated_at timestamptz not null default now()
);

alter table public.partnership_realtime_state enable row level security;
alter table public.partnership_realtime_state force row level security;

drop policy if exists partnership_realtime_state_owner_select on public.partnership_realtime_state;
create policy partnership_realtime_state_owner_select
  on public.partnership_realtime_state for select
  using (recipient_id = (select auth.uid()));

revoke all on public.partnership_realtime_state from anon, authenticated;
grant select on public.partnership_realtime_state to authenticated;

create or replace function public.sync_partnership_realtime_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.partnership_realtime_state (recipient_id, partnership_id, status, updated_at)
  select recipient_id, new.id, new.status, now()
  from (values (new.inviter_id), (new.invitee_id)) recipients(recipient_id)
  where recipient_id is not null
  on conflict (recipient_id) do update
    set partnership_id = excluded.partnership_id,
        status = excluded.status,
        updated_at = excluded.updated_at;

  delete from public.partnership_realtime_state
  where partnership_id = new.id
    and recipient_id <> new.inviter_id
    and (new.invitee_id is null or recipient_id <> new.invitee_id);
  return new;
end;
$$;

revoke all on function public.sync_partnership_realtime_state() from public, anon, authenticated;

drop trigger if exists sync_partnership_realtime_state_trigger on public.partnerships;
create trigger sync_partnership_realtime_state_trigger
after insert or update of invitee_id, status on public.partnerships
for each row execute function public.sync_partnership_realtime_state();

insert into public.partnership_realtime_state (recipient_id, partnership_id, status, updated_at)
select recipient_id, p.id, p.status, p.updated_at
from public.partnerships p
cross join lateral (values (p.inviter_id), (p.invitee_id)) recipients(recipient_id)
where recipient_id is not null
on conflict (recipient_id) do update
  set partnership_id = excluded.partnership_id,
      status = excluded.status,
      updated_at = excluded.updated_at;

do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'support_requests',
      'sharing_preferences',
      'communication_preferences',
      'partnership_realtime_state'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public'
          and tablename = realtime_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      end if;
    end loop;
  end if;
end;
$$;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) > 0),
  p256dh text not null check (char_length(p256dh) > 0),
  auth text not null check (char_length(auth) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

create or replace function public.protect_push_subscription_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'push subscription owner is immutable' using errcode = '23514';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.protect_push_subscription_owner() from public, anon, authenticated;

drop trigger if exists protect_push_subscription_owner_trigger on public.push_subscriptions;
create trigger protect_push_subscription_owner_trigger
before update on public.push_subscriptions
for each row execute function public.protect_push_subscription_owner();

drop policy if exists push_subscriptions_owner_select on public.push_subscriptions;
create policy push_subscriptions_owner_select on public.push_subscriptions
  for select using (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_owner_insert on public.push_subscriptions;
create policy push_subscriptions_owner_insert on public.push_subscriptions
  for insert with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_owner_update on public.push_subscriptions;
create policy push_subscriptions_owner_update on public.push_subscriptions
  for update using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, insert, update on public.push_subscriptions to authenticated;
