import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Quality must execute the same offline security regression that can be run
 * directly with: node --test scripts/rehearse-v3-public-result-snapshot.security.test.mjs
 *
 * The child test stubs BOTH supabase and psql with temporary executables.
 * There is no database or network I/O in this test.
 */
describe("World TG19 shared rehearsal production-isolation guard", () => {
  it("rejects hosted URL impersonation and libpq overrides before database commands", () => {
    const result = spawnSync(
      process.execPath,
      ["--test", resolve("scripts/rehearse-v3-public-result-snapshot.security.test.mjs")],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 20_000,
        maxBuffer: 1024 * 1024,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain("# pass 4");
  });
});
