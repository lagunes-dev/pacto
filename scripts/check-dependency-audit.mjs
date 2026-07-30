import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const reviewedInventory = [
  "@trickfilm400/rollup-plugin-off-main-thread:high",
  "brace-expansion:high",
  "ejs:high",
  "filelist:high",
  "jake:high",
  "minimatch:high",
  "vite-plugin-pwa:high",
  "workbox-build:high",
].sort();

async function auditReport() {
  const inputIndex = process.argv.indexOf("--input");
  if (inputIndex !== -1) return JSON.parse(await readFile(process.argv[inputIndex + 1], "utf8"));

  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : "npm";
  const args = npmCli ? [npmCli, "audit", "--json"] : ["audit", "--json"];
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: !npmCli && process.platform === "win32",
  });
  if (!result.stdout) throw new Error(result.stderr || "npm audit produced no report");
  return JSON.parse(result.stdout);
}

try {
  const report = await auditReport();
  const actual = Object.entries(report.vulnerabilities ?? {})
    .map(([name, finding]) => `${name}:${finding.severity}`)
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(reviewedInventory)) {
    throw new Error(`Unreviewed dependency audit inventory. Expected ${reviewedInventory.join(", ")}; received ${actual.join(", ") || "none"}.`);
  }
  console.log("Dependency audit classified: 8 HIGH findings in the reviewed vite-plugin-pwa/Workbox development chain.");
  console.log("Breaking/force remediation remains prohibited; review lockfile and generated PWA artifacts before dependency changes.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
