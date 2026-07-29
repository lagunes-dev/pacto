import { spawnSync } from "node:child_process";

const required = [
  "SUPABASE_TEST_URL",
  "SUPABASE_TEST_PUBLISHABLE_KEY",
  "SUPABASE_TEST_USER_A_EMAIL",
  "SUPABASE_TEST_USER_A_PASSWORD",
  "SUPABASE_TEST_USER_B_EMAIL",
  "SUPABASE_TEST_USER_B_PASSWORD",
  "SUPABASE_TEST_INTRUDER_EMAIL",
  "SUPABASE_TEST_INTRUDER_PASSWORD",
];
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length) {
  console.log("Live authorization evidence: SKIPPED (BLOCKED).");
  console.log(`Missing credential-gated prerequisites:\n- ${missing.join("\n- ")}`);
  console.log("No live RLS or adapter claim is made. Use disposable confirmed users and never VITE_* variables for passwords.");
  process.exit(0);
}

const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["exec", "--", "vitest", "run", "--config", "vitest.live.config.ts"],
  { stdio: "inherit", env: process.env },
);
if (result.error) {
  console.error(`Live authorization evidence failed to start: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
