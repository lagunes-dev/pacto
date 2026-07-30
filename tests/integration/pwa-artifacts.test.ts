import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const validator = resolve("scripts/validate-pwa-artifacts.mjs");
const auditCheck = resolve("scripts/check-dependency-audit.mjs");

async function artifactFixture(overrides: Record<string, string | null> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "pacto-pwa-"));
  const files = {
    "manifest.webmanifest": JSON.stringify({
      name: "Pacto",
      short_name: "Pacto",
      start_url: "/",
      display: "standalone",
      icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    }),
    "sw.js": 'importScripts("/push-handler.js"); precacheAndRoute([{url:"index.html"},{url:"push-handler.js"}]); new NavigationRoute(createHandlerBoundToURL("index.html"));',
    "push-handler.js": "self.addEventListener('push', () => {});",
    "icons/icon-192.png": "icon",
    ...overrides,
  };

  for (const [name, contents] of Object.entries(files)) {
    if (contents === null) continue;
    await mkdir(dirname(join(directory, name)), { recursive: true });
    await writeFile(join(directory, name), contents);
  }
  return directory;
}

function run(script: string, ...args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

describe("generated PWA artifacts", () => {
  test("accepts a generated manifest, worker, icons, push handler, and private-safe cache policy", async () => {
    const directory = await artifactFixture();
    expect(run(validator, directory).status).toBe(0);
  });

  test.each([
    ["missing manifest", { "manifest.webmanifest": null }],
    ["malformed manifest", { "manifest.webmanifest": "{" }],
    ["missing worker", { "sw.js": null }],
    ["missing worker policy", { "sw.js": "self.skipWaiting();" }],
    ["missing declared icon", { "manifest.webmanifest": JSON.stringify({ name: "Pacto", short_name: "Pacto", start_url: "/", display: "standalone", icons: [{ src: "/icons/missing.png" }] }) }],
    ["missing push handler", { "push-handler.js": null }],
    ["missing push handler import", { "sw.js": 'precacheAndRoute([{url:"index.html"}]); new NavigationRoute(createHandlerBoundToURL("index.html"));' }],
  ])("rejects %s", async (_name, overrides) => {
    const directory = await artifactFixture(overrides);
    expect(run(validator, directory).status).not.toBe(0);
  });
});

describe("dependency audit inventory", () => {
  test("rejects an unreviewed vulnerability inventory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pacto-audit-"));
    const report = join(directory, "audit.json");
    await writeFile(report, JSON.stringify({ vulnerabilities: { unexpected: { severity: "high" } } }));
    expect(run(auditCheck, "--input", report).status).not.toBe(0);
  });
});
