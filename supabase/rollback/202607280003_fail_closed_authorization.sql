begin;

-- Operational rollback is intentionally fail-closed. It removes browser access
-- without dropping data, policies, migrations, or forced RLS.
revoke all on function public.create_partnership_invite(text) from public, anon, authenticated;
revoke all on function public.accept_partnership_invite(text) from public, anon, authenticated;
revoke all on function public.reject_partnership_invite(text) from public, anon, authenticated;
revoke all on function public.cancel_pending_partnership() from public, anon, authenticated;
revoke all on function public.pause_partnership() from public, anon, authenticated;
revoke all on function public.end_partnership() from public, anon, authenticated;
revoke all on function public.get_my_partnership_state() from public, anon, authenticated;
revoke all on function public.create_support_request(text) from public, anon, authenticated;
revoke all on function public.acknowledge_support_request(uuid) from public, anon, authenticated;
revoke all on function public.close_support_request(uuid) from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles', 'partnerships', 'sharing_preferences', 'communication_preferences',
    'goals', 'daily_entries', 'habit_entries', 'private_notes', 'recovery_plans',
    'support_requests', 'shared_daily_summaries'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end $$;

commit;
