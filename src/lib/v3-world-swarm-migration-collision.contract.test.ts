import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TG19: make the existing offline World migration-collision regressions
 * discoverable by the canonical Quality/Vitest test runner.
 * Never run live GitHub or Supabase traffic from this test.
 */
describe("World swarm migration-collision preflight", () => {
  it("passes all deterministic offline snapshot and mocked-GitHub cases", () => {
    const suite = resolve(process.cwd(), "scripts/check-world-swarm-migration-collisions.test.mjs");
    const run = spawnSync(process.execPath, ["--test", suite], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
      // Avoid passing credentials or production endpoints into a child test.
      env: { PATH: process.env.PATH ?? "", LANG: "C.UTF-8" },
    });
    if (run.error) throw run.error;
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(run.stdout).toContain("# fail 0");
  });
});
