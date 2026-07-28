import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const migrationPaths = [
  "supabase/migrations/202607280001_authorization_schema.sql",
  "supabase/migrations/202607280002_rls_policies.sql",
];
const migrations = migrationPaths.map((path) => readFileSync(`${root}/${path}`, "utf8"));
const [schema, policies] = migrations;
const protectedTables = [
  "profiles", "partnerships", "sharing_preferences", "communication_preferences", "goals",
  "daily_entries", "habit_entries", "private_notes", "recovery_plans", "support_requests",
  "shared_daily_summaries",
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
  [schema.includes("create table if not exists") && schema.includes("create index if not exists"), "schema creation is rerunnable"],
  [policies.includes("drop policy if exists"), "policy replacement is rerunnable"],
];

const failures = assertions.filter(([passed]) => !passed).map(([, message]) => message);
if (failures.length) {
  console.error(`Static SQL validation failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Static SQL validation passed (${assertions.length} assertions).`);

const databaseUrl = process.env.SUPABASE_TEST_DB_URL;
if (!databaseUrl) {
  console.log("Credential-gated SQL execution: SKIPPED (SUPABASE_TEST_DB_URL is not set; no live RLS claim). ");
  process.exit(0);
}

for (const path of [...migrationPaths, ...migrationPaths, "supabase/tests/authorization_rls.sql"]) {
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", `${root}/${path}`], { stdio: "inherit" });
  if (result.error) {
    console.error(`Credential-gated SQL execution unavailable: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Credential-gated migration reapply and RLS assertions passed.");
