import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOLARIS_FEATURE_RULES,
  SOLARIS_FEATURE_FLAGS,
  evaluateSolarisFeatureFlag,
} from "./feature-flags";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261011195500_v3_rollout_feature_flag.sql"),
  "utf8",
);

describe("Solaris App V3 rollout persistence", () => {
  it("registers Solaris App V3 in the canonical feature-flag vocabulary", () => {
    expect(SOLARIS_FEATURE_FLAGS).toContain("solaris_app_v3");
  });

  it("keeps the V3 app rollout disabled by default", () => {
    expect(DEFAULT_SOLARIS_FEATURE_RULES.solaris_app_v3).toEqual({ enabled: false });
    expect(evaluateSolarisFeatureFlag("solaris_app_v3", {})).toBe(false);
  });

  it("allows an explicitly enabled, scoped rule through the existing evaluator", () => {
    expect(
      evaluateSolarisFeatureFlag(
        "solaris_app_v3",
        { userId: "user-1", editionId: "edition-22" },
        {
          solaris_app_v3: {
            enabled: true,
            userIds: ["user-1"],
            editionIds: ["edition-22"],
          },
        },
      ),
    ).toBe(true);

    expect(
      evaluateSolarisFeatureFlag(
        "solaris_app_v3",
        { userId: "other", editionId: "edition-22" },
        {
          solaris_app_v3: {
            enabled: true,
            userIds: ["user-1"],
            editionIds: ["edition-22"],
          },
        },
      ),
    ).toBe(false);
  });

  it("seeds the persisted rollout row disabled", () => {
    expect(migration).toContain("'solaris_app_v3'");
    expect(migration).toContain("false,");
    expect(migration).toContain("on conflict (key) do nothing");
  });

  it("extends rather than replaces the existing constrained flag vocabulary", () => {
    expect(migration).toContain("studio2_feature_flags_key_check");
    expect(migration).toContain("'edition_state_engine'");
    expect(migration).toContain("'solaris_command_assistant'");
    expect(migration).toContain("'solaris_app_v3'");
  });

  it("contains no client-side or localStorage rollout mechanism", () => {
    expect(migration).not.toContain("localStorage");
    expect(migration).not.toContain("VITE_");
  });
});
