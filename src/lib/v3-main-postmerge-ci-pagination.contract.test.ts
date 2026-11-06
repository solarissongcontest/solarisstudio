import { execFileSync } from "node:child_process";
import { describe, it } from "vitest";

/**
 * Quality's Vitest configuration intentionally includes src/**/*.test.ts only.
 * Exercise the standalone Node contract tests on every PR so the post-merge
 * evidence verifier is validated before it is allowed to certify main.
 *
 * This is local-only and makes no GitHub or Supabase requests: the Node suite
 * injects deterministic GitHub response doubles.
 */
describe("post-merge main CI evidence pagination", () => {
  it("passes its isolated Node contract suite", () => {
    execFileSync(process.execPath, ["--test", "scripts/verify-v3-main-ci-evidence.test.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 15_000,
      stdio: "pipe",
    });
  });
});
