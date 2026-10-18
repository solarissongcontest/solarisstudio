import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  ".github/scripts/v3-production-head-upgrade-rehearsal.sh",
  "utf8",
);

const s5ConsequenceRehearsals = readdirSync(".github/scripts")
  .filter((name) => /^v3-s5-.*-consequences-rehearsal\.sh$/.test(name))
  .sort();

describe("System V3 production-head upgrade S5 coverage", () => {
  it("re-runs every checked-in S5 consequence rehearsal after the upgrade", () => {
    expect(s5ConsequenceRehearsals.length).toBeGreaterThan(0);

    for (const rehearsal of s5ConsequenceRehearsals) {
      expect(script, `${rehearsal} must be exercised on the production upgrade path`).toContain(
        rehearsal,
      );
    }
  });

  it("re-runs the Confirmation maintenance edit path that production currently needs", () => {
    expect(script).toContain("v3-confirmation-maintenance-edit-rehearsal.sh");
  });

  it("restores normal local operating mode between destructive rehearsals", () => {
    expect(script).toContain("reset_local_operational_mode");
    expect(script).toContain("mode='normal'");
    expect(script).toContain("Production-head rehearsal isolation");
  });

  it("keeps the production upgrade rehearsal isolated from hosted Supabase", () => {
    expect(script).toContain("Refusing hosted Supabase rehearsal");
    expect(script).toContain("Refusing non-local database rehearsal");
    expect(script).toContain("supabase migration up --local --include-all");
  });
});
