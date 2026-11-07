import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * The canonical Quality/Vitest config discovers src/**/*.test.ts files, not
 * standalone scripts/*.test.mjs files. Run the real offline claim-collision
 * regression suite without adding a workflow or contacting GitHub/Supabase.
 */
describe("WORLD TG0/TG19 claim collision preflight", () => {
  it("runs all seven offline Node ownership-collision regressions in Quality", () => {
    const result = spawnSync("node", ["--test", "scripts/check-world-swarm-claims.test.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      // Regression fixtures use injected fetch only; never inherit production
      // or connector credentials into subprocesses.
      env: { PATH: process.env.PATH ?? "", LANG: "C.UTF-8" },
    });

    expect(result.error).toBeUndefined();
    expect(result.status, [result.stdout, result.stderr].join("\n")).toBe(0);
    expect(result.stdout).toMatch(/# tests 7\b/);
    expect(result.stdout).toMatch(/# fail 0\b/);
  });
});
