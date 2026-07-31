import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationPaths = [
  "supabase/migrations/202607280001_authorization_schema.sql",
  "supabase/migrations/202607280002_rls_policies.sql",
  "supabase/migrations/202607280003_lifecycle_rpcs.sql",
  "supabase/migrations/202607290001_support_rpc_response_compatibility.sql",
  "supabase/migrations/202607290002_support_rpc_full_response.sql",
  "supabase/migrations/202607290003_lifecycle_rpc_contracts.sql",
  "supabase/migrations/202607290004_profile_bootstrap_lifecycle.sql",
  "supabase/migrations/202607290005_qualify_support_returning.sql",
  "supabase/migrations/202607300001_realtime_push.sql",
  "supabase/migrations/202607300002_daily_checkin_rpc.sql",
  "supabase/migrations/202607310001_demo_parity_complete.sql",
];
const migrations = migrationPaths.map((path) => readFileSync(`${root}/${path}`, "utf8"));
const [schema, policies, lifecycle] = migrations;
const compatibility = migrations[3];
const fullResponse = migrations[4];
const finalContracts = migrations[5];
const profileBootstrap = migrations[6];
const qualifiedSupport = migrations[7];
const realtimePush = migrations[8];
const dailyCheckin = migrations[9];
const recovery = migrations[10];
const rollbackPath = "supabase/rollback/202607280003_fail_closed_authorization.sql";
const rollback = readFileSync(`${root}/${rollbackPath}`, "utf8");
const runtimeTestPaths = [
  "supabase/tests/authorization_rls.sql",
  "supabase/tests/lifecycle_rpcs.sql",
  "supabase/tests/realtime_push_rls.sql",
  "supabase/tests/daily_checkin_rpc.sql",
  "supabase/tests/demo_parity_recovery.sql",
];
const runtimeAssertions = runtimeTestPaths.map((path) => readFileSync(`${root}/${path}`, "utf8")).join("\n");
const envExample = readFileSync(`${root}/.env.example`, "utf8");
const readme = readFileSync(`${root}/README.md`, "utf8");
const deploymentRunbook = readFileSync(`${root}/docs/supabase-deployment-security.md`, "utf8");
const protectedTables = [
  "profiles", "partnerships", "sharing_preferences", "communication_preferences", "goals",
  "daily_entries", "habit_entries", "private_notes", "recovery_plans", "support_requests",
  "shared_daily_summaries",
];
const lifecycleRpcs = [
  "create_partnership_invite(text)", "accept_partnership_invite(text)",
  "reject_partnership_invite(text)", "cancel_pending_partnership()",
  "pause_partnership()", "end_partnership()", "get_my_partnership_state()",
  "create_support_request(text)", "acknowledge_support_request(uuid)",
  "close_support_request(uuid)",
];

const assertions = [
  [migrationPaths.every((path) => /^supabase\/migrations\/\d+_.+\.sql$/.test(path)), "migrations are versioned"],
  [protectedTables.every((table) => policies.includes(`'${table}'`)), "every protected table is in the RLS loop"],
  [policies.includes("force row level security"), "RLS is forced"],
  [policies.includes("revoke all on table") && policies.includes("from public, anon, authenticated"), "table grants start denied"],
  [!/^grant .* to anon/im.test(policies), "anon receives no table grant"],
  [(policies.match(/create policy private_notes_/g) ?? []).length === 1, "private notes have one owner policy only"],
  [policies.includes("support_active_members_select") && policies.includes("p.status = 'active'"), "support visibility requires active membership"],
  [policies.includes("partnerships_active_members_select") && policies.includes("status = 'active'"), "partnership visibility requires active membership"],
  [schema.includes("reject_protected_column_update") && schema.includes("private_notes_owner_immutable"), "protected identities are immutable"],
  [schema.includes("shared_daily_summaries_entry_owner_fk") && schema.includes("foreign key (daily_entry_id, owner_id) references public.daily_entries(id, user_id)"), "shared summaries enforce daily-entry ownership linkage"],
  [runtimeAssertions.includes("ownership-linked summary accepted a mismatched owner") && runtimeAssertions.includes("exception when foreign_key_violation"), "runtime suite rejects ownership-link mismatches"],
  [schema.includes("create table if not exists") && schema.includes("create index if not exists"), "schema creation is rerunnable"],
  [policies.includes("drop policy if exists"), "policy replacement is rerunnable"],
  [(lifecycle.match(/security definer/g) ?? []).length === (lifecycle.match(/set search_path = ''/g) ?? []).length, "every security-definer lifecycle function fixes its search path"],
  [lifecycle.includes("extensions.gen_random_bytes(18)") && !/(?<!\.)\bgen_random_bytes\s*\(/.test(lifecycle), "pgcrypto calls use the installed extensions schema"],
  [lifecycle.includes("auth.uid()") && lifecycle.includes("private.require_actor()"), "lifecycle identity is derived from auth.uid()"],
  [lifecycle.includes("private.active_partnership_id()") && lifecycle.includes("p.status = 'active'"), "support creation requires active membership"],
  [lifecycle.includes("actor_id <> r.requester_id") && lifecycle.includes("r.status = 'acknowledged'"), "support transitions require the other member and valid state"],
  [lifecycle.includes("requester_id uuid") && lifecycle.includes("support_type text") && (lifecycle.match(/support_request_id uuid/g) ?? []).length >= 3, "support write RPCs return the complete safe DTO source fields"],
  [compatibility.includes("drop function if exists public.acknowledge_support_request(uuid)") && compatibility.includes("requester_id uuid") && compatibility.includes("support_type text"), "forward compatibility migration replaces already-recorded support RPC signatures"],
  [fullResponse.includes("add column if not exists closed_at timestamptz") && (fullResponse.match(/closed_at timestamptz/g) ?? []).length >= 3, "full support response migration adds an idempotent closed timestamp and DTO field"],
  [fullResponse.includes("set status = 'closed', closed_at = clock_timestamp()") && fullResponse.includes("set search_path = ''"), "closed support transitions persist the close timestamp with a fixed search path"],
  [finalContracts.includes("drop function if exists public.create_partnership_invite(text)") && finalContracts.includes("expires_at timestamptz") && finalContracts.includes("join public.profiles"), "final invite migration replaces the exact signature and requires a profiled target"],
  [finalContracts.includes("drop function if exists public.create_support_request(text)") && (finalContracts.match(/closed_at timestamptz/g) ?? []).length >= 3, "final support migration replaces the exact overload with the complete DTO"],
  [finalContracts.includes("set search_path = ''") && finalContracts.includes("grant execute on function public.create_partnership_invite(text) to authenticated"), "final lifecycle migration hardens search paths and authenticated grants"],
  [profileBootstrap.includes("private.ensure_profile(uuid)") && profileBootstrap.includes("perform private.ensure_profile(actor_id)") && profileBootstrap.includes("perform private.ensure_profile(target_id)"), "invite bootstraps missing profiles only for the actor and exact target"],
  [profileBootstrap.includes("revoke all on function private.ensure_profile(uuid)") && profileBootstrap.includes("set search_path = ''") && !profileBootstrap.includes("return user_email"), "profile bootstrap is private, fixed-path, and does not return email data"],
  [qualifiedSupport.includes("drop function if exists public.create_support_request(text)") && qualifiedSupport.includes("public.support_requests.requester_id") && !qualifiedSupport.match(/returning id, requester_id,/) && (qualifiedSupport.match(/returning /g) ?? []).length === 3, "qualified support migration removes ambiguous RETURNING references from every support RPC"],
  [(qualifiedSupport.match(/security definer/g) ?? []).length === (qualifiedSupport.match(/set search_path = ''/g) ?? []).length && qualifiedSupport.includes("private.require_actor()") && qualifiedSupport.includes("private.active_partnership_id()"), "qualified support migration preserves secure identity and fixed search paths"],
  [qualifiedSupport.includes("revoke all on function public.create_support_request(text), public.acknowledge_support_request(uuid), public.close_support_request(uuid) from public, anon, authenticated") && qualifiedSupport.includes("grant execute on function public.create_support_request(text), public.acknowledge_support_request(uuid), public.close_support_request(uuid) to authenticated"), "qualified support migration preserves authenticated-only RPC grants"],
  [realtimePush.includes("create table if not exists public.partnership_realtime_state") && realtimePush.includes("recipient_id uuid primary key") && realtimePush.includes("status text not null check"), "Realtime state table is owner-addressed and status-constrained"],
  [realtimePush.includes("enable row level security") && realtimePush.includes("force row level security") && realtimePush.includes("partnership_realtime_state_owner_select") && realtimePush.includes("recipient_id = (select auth.uid())"), "Realtime state is protected by forced owner-only RLS"],
  [realtimePush.includes("sync_partnership_realtime_state_trigger") && realtimePush.includes("after insert or update of invitee_id, status") && realtimePush.includes("on conflict (recipient_id) do update"), "Realtime state trigger is rerunnable and tracks partnership changes"],
  [realtimePush.includes("supabase_realtime") && realtimePush.includes("partnership_realtime_state") && realtimePush.includes("alter publication supabase_realtime add table"), "Realtime publication registration is conditional and allowlisted"],
  [realtimePush.includes("create table if not exists public.push_subscriptions") && realtimePush.includes("endpoint text not null unique") && realtimePush.includes("p256dh text not null") && realtimePush.includes("auth text not null"), "push subscriptions persist only owner routing material"],
  [realtimePush.includes("protect_push_subscription_owner_trigger") && realtimePush.includes("push subscription owner is immutable"), "push subscription ownership is immutable"],
  [(realtimePush.match(/create policy push_subscriptions_owner_/g) ?? []).length === 3 && realtimePush.includes("force row level security") && realtimePush.includes("user_id = (select auth.uid())"), "push subscription access is owner-only under forced RLS"],
  [runtimeAssertions.includes("foreign push subscription was disclosed") && runtimeAssertions.includes("owner idempotent push upsert failed"), "runtime SQL covers foreign denial and owner idempotent upsert"],
  [dailyCheckin.includes("security invoker") && !dailyCheckin.includes("security definer"), "daily check-in RPC runs as SECURITY INVOKER"],
  [dailyCheckin.includes("auth.uid()") && dailyCheckin.includes("America/Mexico_City") && dailyCheckin.includes("pg_timezone_names"), "daily check-in derives actor and validated local day server-side"],
  [dailyCheckin.includes("on conflict (user_id, entry_date) do update") && dailyCheckin.includes("on conflict (daily_entry_id, goal_id) do update"), "daily and habit rows are idempotently upserted in one RPC"],
  [dailyCheckin.includes("revoke all on function public.save_daily_checkin(text, smallint, jsonb) from public, anon, authenticated") && dailyCheckin.includes("grant execute on function public.save_daily_checkin(text, smallint, jsonb) to authenticated"), "daily check-in execution is authenticated-only"],
  [!dailyCheckin.includes("private_notes") && !dailyCheckin.includes("shared_daily_summaries") && !dailyCheckin.includes("support_requests"), "daily check-in RPC cannot write private or shared data"],
  [runtimeAssertions.includes("foreign owner goal was accepted") && runtimeAssertions.includes("repeat save created more than one owner/local-day row") && runtimeAssertions.includes("daily check-in RPC is not security invoker"), "runtime SQL covers check-in owner isolation, idempotence, and invoker security"],
  [recovery.includes("create table if not exists public.recovery_event_records") && recovery.includes("create table if not exists public.weekly_review_records"), "Registro event and weekly record tables are versioned"],
  [recovery.includes("force row level security") && recovery.includes("recovery_events_owner_select") && recovery.includes("weekly_reviews_owner_select"), "Registro records use forced owner-only RLS"],
  [recovery.includes("p_operation_id uuid") && recovery.includes("p_expected_revision integer") && recovery.includes("request_hash") && recovery.includes("Recovery revision conflict"), "recovery RPC enforces idempotency and revision conflicts"],
  [recovery.includes("revoke insert, update, delete on public.recovery_plans, public.private_notes from authenticated") && recovery.includes("grant execute on function public.save_recovery_record"), "recovery and note writes are RPC-only"],
  [!recovery.match(/insert into public\.(support_requests|shared_daily_summaries)/) && runtimeAssertions.includes("private recovery payload leaked into a support/shared projection"), "recovery payload is excluded from support and shared projections"],
  [runtimeAssertions.includes("partner could read an owner private note") && runtimeAssertions.includes("partner could read an owner weekly review") && runtimeAssertions.includes("operation ID accepted a different payload") && runtimeAssertions.includes("stale expected revision overwrote recovery history"), "runtime SQL covers private record isolation, idempotency hash, and conflicts"],
  [migrationPaths.indexOf("supabase/migrations/202607300001_realtime_push.sql") > migrationPaths.indexOf("supabase/migrations/202607290005_qualify_support_returning.sql"), "Realtime push migration runs after the existing migration chain"],
  [lifecycle.includes("drop function if exists public.create_partnership_invite(text);\ncreate or replace function public.create_partnership_invite(target_email text)"), "base lifecycle migration drops the exact invite signature before recreation"],
  [lifecycleRpcs.slice(-3).every((rpc) => fullResponse.includes(`grant execute on function public.${rpc} to authenticated`)), "full response migration preserves explicit authenticated support RPC grants"],
  [migrationPaths.indexOf("supabase/migrations/202607290001_support_rpc_response_compatibility.sql") > migrationPaths.indexOf("supabase/migrations/202607280003_lifecycle_rpcs.sql"), "compatibility migration runs after lifecycle RPCs"],
  [lifecycle.includes("revoke all on function private.require_actor()") && !/grant execute on function private\./i.test(lifecycle), "private helpers are not executable by browser roles"],
  [lifecycle.includes("revoke insert, update, delete on public.partnerships") && lifecycle.includes("revoke insert, update, delete on public.support_requests"), "direct lifecycle table mutation remains revoked"],
  [lifecycleRpcs.every((rpc) => lifecycle.includes(`grant execute on function public.${rpc} to authenticated`)), "every public lifecycle RPC has a named authenticated grant"],
  [!lifecycle.includes("private_notes") && !lifecycle.includes("invitee_email"), "RPC return contracts expose no private notes or invitee email"],
  [runtimeAssertions.includes("intruder accepted another user invite") && runtimeAssertions.includes("requester acknowledged their own support request"), "runtime suite covers forbidden lifecycle transitions"],
  [runtimeAssertions.includes("direct partnership identity mutation was allowed") && runtimeAssertions.includes("partnership lifecycle identity changed"), "runtime suite covers immutable lifecycle identity"],
  [protectedTables.every((table) => rollback.includes(`'${table}'`)) && rollback.includes("force row level security"), "rollback preserves forced RLS for every protected table"],
  [lifecycleRpcs.every((rpc) => rollback.includes(`revoke all on function public.${rpc}`)), "rollback revokes every public lifecycle RPC"],
  [!/^\s*(drop|truncate|delete)\b/im.test(rollback) && !rollback.includes("disable row level security"), "rollback retains data, schema, and RLS"],
  [envExample.includes("VITE_VAPID_PUBLIC_KEY=") && !envExample.includes("VAPID_PRIVATE_KEY="), "browser env example exposes only the public VAPID key"],
  [deploymentRunbook.includes("supabase db push --dry-run") && deploymentRunbook.includes("supabase db push"), "deployment runbook previews and applies hosted migrations"],
  [deploymentRunbook.includes("supabase secrets set --env-file .env.vapid.local") && deploymentRunbook.includes("supabase functions deploy send-support-push"), "deployment runbook configures secrets and deploys the push function"],
  [deploymentRunbook.includes("Realtime/RLS") && deploymentRunbook.includes("SKIPPED (BLOCKED)"), "deployment runbook defines truthful hosted Realtime and RLS evidence"],
  [deploymentRunbook.includes("provider acceptance") && deploymentRunbook.includes("device display"), "deployment runbook separates provider acceptance from device display"],
  [deploymentRunbook.includes("supabase functions delete send-support-push") && deploymentRunbook.includes("supabase secrets unset"), "deployment runbook includes function and secret cleanup"],
  [readme.includes("VITE_VAPID_PUBLIC_KEY") && readme.includes("acción explícita"), "README documents public-key-only explicit push activation"],
];

const failures = assertions.filter(([passed]) => !passed).map(([, message]) => message);
if (failures.length) {
  console.error(`Static SQL validation failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Static SQL validation passed (${assertions.length} assertions).`);

const databaseUrl = process.env.SUPABASE_TEST_DB_URL;
const psqlProbe = spawnSync("psql", ["--version"], { encoding: "utf8" });
const missingPrerequisites = [];
if (!databaseUrl) missingPrerequisites.push("SUPABASE_TEST_DB_URL for a disposable database");
if (psqlProbe.error || psqlProbe.status !== 0) missingPrerequisites.push("psql available on PATH");

if (missingPrerequisites.length) {
  console.log("Runtime SQL/RLS evidence: SKIPPED (BLOCKED).");
  console.log(`Missing prerequisites:\n- ${missingPrerequisites.join("\n- ")}`);
  console.log("Required runtime target: a disposable Supabase/Postgres database with the auth schema and migration privileges.");
  console.log("Static validation passed; no runtime RLS claim is made.");
  process.exit(0);
}

for (const path of [...migrationPaths, ...migrationPaths, ...runtimeTestPaths]) {
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", `${root}/${path}`], { stdio: "inherit" });
  if (result.error) {
    console.error(`Credential-gated SQL execution unavailable: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Credential-gated migration reapply and RLS assertions passed.");
