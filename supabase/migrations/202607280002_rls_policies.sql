begin;

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'profiles', 'partnerships', 'sharing_preferences', 'communication_preferences',
    'goals', 'daily_entries', 'habit_entries', 'private_notes', 'recovery_plans',
    'support_requests', 'shared_daily_summaries'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    for policy_name in
      select policyname from pg_policies where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy %I on public.%I', policy_name, table_name);
    end loop;
  end loop;
end $$;

drop function if exists public.is_active_partner(uuid, uuid);

drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_active_partner_select on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_active_partner_select on public.profiles for select to authenticated using (
  exists (
    select 1 from public.partnerships p
    where p.status = 'active'
      and ((p.inviter_id = profiles.id and p.invitee_id = (select auth.uid()))
        or (p.invitee_id = profiles.id and p.inviter_id = (select auth.uid())))
  )
);
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists partnerships_active_members_select on public.partnerships;
create policy partnerships_active_members_select on public.partnerships for select to authenticated
  using (status = 'active' and (select auth.uid()) in (inviter_id, invitee_id));

drop policy if exists sharing_owner_all on public.sharing_preferences;
create policy sharing_owner_all on public.sharing_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists communication_owner_all on public.communication_preferences;
create policy communication_owner_all on public.communication_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists goals_owner_all on public.goals;
create policy goals_owner_all on public.goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists daily_entries_owner_all on public.daily_entries;
create policy daily_entries_owner_all on public.daily_entries for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists habit_entries_owner_all on public.habit_entries;
create policy habit_entries_owner_all on public.habit_entries for all to authenticated using (
  exists (
    select 1 from public.daily_entries d
    join public.goals g on g.id = habit_entries.goal_id
    where d.id = habit_entries.daily_entry_id
      and d.user_id = (select auth.uid()) and g.user_id = (select auth.uid())
  )
) with check (
  exists (
    select 1 from public.daily_entries d
    join public.goals g on g.id = habit_entries.goal_id
    where d.id = habit_entries.daily_entry_id
      and d.user_id = (select auth.uid()) and g.user_id = (select auth.uid())
  )
);

drop policy if exists private_notes_owner_all on public.private_notes;
create policy private_notes_owner_all on public.private_notes for all to authenticated using (
  user_id = (select auth.uid())
) with check (
  user_id = (select auth.uid()) and (
    daily_entry_id is null or exists (
      select 1 from public.daily_entries d
      where d.id = private_notes.daily_entry_id and d.user_id = (select auth.uid())
    )
  )
);

drop policy if exists recovery_plans_owner_all on public.recovery_plans;
create policy recovery_plans_owner_all on public.recovery_plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists support_active_members_select on public.support_requests;
create policy support_active_members_select on public.support_requests for select to authenticated using (
  exists (
    select 1 from public.partnerships p
    where p.id = support_requests.partnership_id and p.status = 'active'
      and (select auth.uid()) in (p.inviter_id, p.invitee_id)
  )
);

drop policy if exists summaries_owner_all on public.shared_daily_summaries;
drop policy if exists summaries_active_partner_select on public.shared_daily_summaries;
create policy summaries_owner_all on public.shared_daily_summaries for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy summaries_active_partner_select on public.shared_daily_summaries for select to authenticated using (
  exists (
    select 1 from public.partnerships p
    where p.status = 'active'
      and ((p.inviter_id = shared_daily_summaries.owner_id and p.invitee_id = (select auth.uid()))
        or (p.invitee_id = shared_daily_summaries.owner_id and p.inviter_id = (select auth.uid())))
  )
);

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.sharing_preferences to authenticated;
grant select, insert, update, delete on public.communication_preferences to authenticated;
grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, update, delete on public.daily_entries to authenticated;
grant select, insert, update, delete on public.habit_entries to authenticated;
grant select, insert, update, delete on public.private_notes to authenticated;
grant select, insert, update, delete on public.recovery_plans to authenticated;
grant select on public.partnerships to authenticated;
grant select on public.support_requests to authenticated;
grant select, insert, update, delete on public.shared_daily_summaries to authenticated;

revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;

commit;
