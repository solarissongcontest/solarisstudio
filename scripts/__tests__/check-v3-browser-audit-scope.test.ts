import { describe, expect, test } from "bun:test";
import {
  assessBrowserAuditScope,
  isBrowserNeutralFile,
} from "../check-v3-browser-audit-scope";

describe("V3 Browser Audit affected-change scope", () => {
  test("pushes and manual/non-PR runs always keep the full Browser Audit", () => {
    for (const eventName of ["push", "workflow_dispatch", "schedule", ""]) {
      const result = assessBrowserAuditScope(eventName, ["docs/release.md"]);
      expect(result.runHeavy, eventName || "empty event").toBe(true);
    }
  });

  test("fails closed when the PR changed-file inventory is empty", () => {
    const result = assessBrowserAuditScope("pull_request", []);
    expect(result.runHeavy).toBe(true);
    expect(result.reason).toContain("fail closed");
  });

  test("recognizes browser-neutral QA, CI, docs and local rehearsal evidence", () => {
    const neutral = [
      "docs/v3-release.md",
      "README.md",
      "src/lib/v3-qa-release-truth.ts",
      "src/lib/v3-qa-release-truth.test.ts",
      "src/lib/v3-jury-share-certification.ts",
      "src/lib/v3-jury-share-certification.test.ts",
      "src/lib/v3-pr-integration-state.ts",
      "scripts/check-v3-qa-release-truth.ts",
      "scripts/check-v3-parallel-pr-conflicts.ts",
      "scripts/__tests__/check-v3-parallel-pr-conflicts.test.ts",
      ".github/workflows/v3-parallel-pr-conflict-guard.yml",
      ".github/workflows/v3-release-candidate-preflight.yml",
      ".github/scripts/v3-production-head-upgrade-rehearsal.sh",
    ];

    for (const path of neutral) {
      expect(isBrowserNeutralFile(path), path).toBe(true);
    }

    const result = assessBrowserAuditScope("pull_request", neutral);
    expect(result.runHeavy).toBe(false);
    expect(result.browserRelevantOrUnknownFiles).toEqual([]);
  });

  test("keeps product, route, style, dependency, migration and browser-test changes heavy", () => {
    const heavy = [
      "src/routes/results.tsx",
      "src/components/v3/V3ResultsScreen.tsx",
      "src/lib/results-source.server.ts",
      "src/styles/liquid.css",
      "src/routes/__root.tsx",
      "package.json",
      "bun.lock",
      "supabase/migrations/20261023000000_change.sql",
      "e2e/v3-navigation/installed-app.e2e.ts",
      ".github/workflows/browser-audit.yml",
      ".github/scripts/seed-browser-e2e-local.sh",
      "vite.config.ts",
    ];

    for (const path of heavy) {
      expect(isBrowserNeutralFile(path), path).toBe(false);
    }

    const result = assessBrowserAuditScope("pull_request", heavy);
    expect(result.runHeavy).toBe(true);
    expect(result.browserRelevantOrUnknownFiles).toEqual([...heavy].sort());
  });

  test("one unknown file makes a mixed PR run the full Browser Audit", () => {
    const result = assessBrowserAuditScope("pull_request", [
      "src/lib/v3-qa-release-truth.test.ts",
      "docs/release.md",
      "src/routes/explore.tsx",
    ]);

    expect(result.runHeavy).toBe(true);
    expect(result.browserNeutralFiles).toEqual([
      "docs/release.md",
      "src/lib/v3-qa-release-truth.test.ts",
    ]);
    expect(result.browserRelevantOrUnknownFiles).toEqual(["src/routes/explore.tsx"]);
  });

  test("does not treat arbitrary application lib code as neutral merely because it is TypeScript", () => {
    expect(isBrowserNeutralFile("src/lib/v3-results.ts")).toBe(false);
    expect(isBrowserNeutralFile("src/lib/v3-navigation.ts")).toBe(false);
    expect(isBrowserNeutralFile("scripts/build-client.ts")).toBe(false);
  });
});
