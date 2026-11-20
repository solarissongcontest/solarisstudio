import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Explicitly bridge the independent Node-only World audit into the repository's
// canonical Vitest/Quality selection (which includes src/**/*.test.ts only).
// The child processes read only checked-out PWA source files: no network,
// browser, Supabase, preview or production runtime is started.
const runner = resolve(process.cwd(), "scripts/check-world-private-offline-boundary.mjs");
const regressions = resolve(process.cwd(), "scripts/check-world-private-offline-boundary.test.mjs");
const run = (args: string[]) => execFileSync(process.execPath, args, {
  cwd: process.cwd(),
  encoding: "utf8",
  timeout: 15_000,
  maxBuffer: 256_000,
});

describe("TG12/TG18/TG19 private World PWA/offline disclosure boundary", () => {
  it("runs the actual local-only preflight against the current source tree", () => {
    const report = JSON.parse(run([runner])) as {
      clean: boolean;
      checks: { id: string; passed: boolean }[];
      issues: { id: string; detail: string }[];
    };
    expect(report.clean, JSON.stringify(report.issues)).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.checks).toHaveLength(8);
    expect(report.checks.every((check) => check.passed)).toBe(true);
  });

  it("executes the offline synthetic regression suite, not just the happy path", () => {
    // node:test intentionally runs outside Vitest's own test registration;
    // process exit status is authoritative for all six mutation scenarios.
    expect(() => run(["--test", regressions])).not.toThrow();
  });
});
