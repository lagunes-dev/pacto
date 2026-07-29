import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const runnerPath = fileURLToPath(new URL("../../scripts/run-live-authorization.mjs", import.meta.url));

describe("live authorization runner", () => {
  it("invokes the local Vitest CLI through the current Node process", async () => {
    const source = await readFile(runnerPath, "utf8");

    expect(source).toContain("process.execPath");
    expect(source).toContain("node_modules/vitest/vitest.mjs");
    expect(source).not.toContain("npm.cmd");
    expect(source).not.toContain('shell: true');
  });
});
