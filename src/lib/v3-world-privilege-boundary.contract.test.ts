import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The canonical Vitest suite only discovers TypeScript tests under src. Run the
 * offline node:test TG19 runner under Quality, not just manually. The runner
 * stubs both Supabase and psql: it cannot contact a real database.
 */
describe("TG19 World privilege-rehearsal safety", () => {
  it("keeps the SQL catalog rehearsal read-only", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "scripts/rehearse-v3-world-privilege-boundary.sql"),
      "utf8",
    );
    expect(sql).toContain("set transaction read only;");
    expect(sql).toContain("TG19_WORLD_PRIVILEGES_NO_WORLD_TABLES");
    expect(sql).toContain("TG19_WORLD_PRIVILEGES_FAILED");
    expect(sql).toMatch(/\brollback\s*;/i);
  });

  it("executes the existing no-network synthetic targets and injection regressions", () => {
    const script = resolve(
      process.cwd(),
      "scripts/rehearse-v3-world-privilege-boundary.test.mjs",
    );
    const result = spawnSync(process.execPath, ["--test", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 20_000,
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    expect(result.error).toBeUndefined();
    expect(result.status, [result.stdout, result.stderr].join("\n")).toBe(0);
    expect(result.stdout).toMatch(/# tests 5\b/);
    expect(result.stdout).toMatch(/# pass 5\b/);
    expect(result.stdout).toMatch(/# fail 0\b/);
  });
});
