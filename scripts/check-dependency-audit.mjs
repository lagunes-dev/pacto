import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const reviewedInventory = [].sort();

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
  console.log("Dependency audit classified: no current findings in the reviewed development dependency tree.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
