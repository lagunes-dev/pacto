import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationPaths = [
  "supabase/migrations/202607280001_authorization_schema.sql",
  "supabase/migrations/202607280002_rls_policies.sql",
  "supabase/migrations/202607280003_lifecycle_rpcs.sql",
];
const migrations = migrationPaths.map((path) => readFileSync(`${root}/${path}`, "utf8"));
const [schema, policies, lifecycle] = migrations;
const runtimeTestPaths = [
  "supabase/tests/authorization_rls.sql",
  "supabase/tests/lifecycle_rpcs.sql",
];
const runtimeAssertions = runtimeTestPaths.map((path) => readFileSync(`${root}/${path}`, "utf8")).join("\n");
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
  [lifecycle.includes("auth.uid()") && lifecycle.includes("private.require_actor()"), "lifecycle identity is derived from auth.uid()"],
  [lifecycle.includes("private.active_partnership_id()") && lifecycle.includes("p.status = 'active'"), "support creation requires active membership"],
  [lifecycle.includes("actor_id <> r.requester_id") && lifecycle.includes("r.status = 'acknowledged'"), "support transitions require the other member and valid state"],
  [lifecycle.includes("revoke all on function private.require_actor()") && !/grant execute on function private\./i.test(lifecycle), "private helpers are not executable by browser roles"],
  [lifecycle.includes("revoke insert, update, delete on public.partnerships") && lifecycle.includes("revoke insert, update, delete on public.support_requests"), "direct lifecycle table mutation remains revoked"],
  [lifecycleRpcs.every((rpc) => lifecycle.includes(`grant execute on function public.${rpc} to authenticated`)), "every public lifecycle RPC has a named authenticated grant"],
  [!lifecycle.includes("private_notes") && !lifecycle.includes("invitee_email"), "RPC return contracts expose no private notes or invitee email"],
  [runtimeAssertions.includes("intruder accepted another user invite") && runtimeAssertions.includes("requester acknowledged their own support request"), "runtime suite covers forbidden lifecycle transitions"],
  [runtimeAssertions.includes("direct partnership identity mutation was allowed") && runtimeAssertions.includes("partnership lifecycle identity changed"), "runtime suite covers immutable lifecycle identity"],
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
