import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// The canonical Vitest config only discovers src/**/*.test.ts(x). Run the
// existing offline Node fixtures instead of pretending an undiscovered
// scripts/*.test.mjs file contributes to the Quality gate.
function offlineNode(args: string[]) {
  const outcome = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  expect(outcome.error).toBeUndefined();
  expect(outcome.status, outcome.stderr || outcome.stdout).toBe(0);
  return outcome.stdout;
}

describe("Terra Solaris TG18 offline route-link integrity", () => {
  it("executes all adversarial and valid-route Node regression fixtures", () => {
    const stdout = offlineNode([
      "--test",
      "scripts/check-v3-world-route-links.test.mjs",
    ]);
    expect(stdout).toMatch(/# pass\s+\d+/);
    expect(stdout).toMatch(/# fail\s+0/);
  }, 90_000);

  it("audits actual checked-out World routes and links, failing closed", () => {
    const stdout = offlineNode([
      "scripts/check-v3-world-route-links.mjs",
      "--json",
    ]);
    const report = JSON.parse(stdout) as {
      ok: boolean;
      routeCount: number;
      checkedLinks: number;
      findings: unknown[];
    };
    expect(report.ok).toBe(true);
    expect(report.routeCount).toBeGreaterThan(0);
    expect(report.checkedLinks).toBeGreaterThan(0);
    expect(report.findings).toEqual([]);
  }, 90_000);
});
