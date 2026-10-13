import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SOLARIS_FEATURE_RULES } from "./feature-flags";
import { STUDIO2_PRODUCT_SURFACES } from "./studio2-product-surfaces";

const source = (path: string) => readFileSync(path, "utf8");

describe("Results production cutover boundary", () => {
  it("keeps deployment independently reversible and disabled by default", () => {
    expect(DEFAULT_SOLARIS_FEATURE_RULES.solaris_app_v3_results.enabled).toBe(false);
    expect(STUDIO2_PRODUCT_SURFACES.solaris_app_v3_results.dependsOn).toEqual(["solaris_app_v3"]);
    const sql = source("supabase/migrations/20261013200000_v3_results_cutover.sql");
    expect(sql).toContain("'solaris_app_v3_results',\n  false");
    expect(sql).toContain("'solaris_app_v3_rules_guidance'");
    expect(sql).toContain("on conflict (key) do nothing");
    expect(sql).not.toMatch(/update public\.(results|shows|participants)|create.*function/i);
  });

  it("requires evaluated global and Results flags in the actual result edition", () => {
    const route = source("src/routes/results/index.tsx");
    expect(route).toContain("useV3EditionRolloutProbe(");
    expect(route).toContain('latestEdition?.slug ?? ""');
    expect(route).toContain("rollout.data?.enabled === true");
    expect(route).toContain("rollout.data?.resultsEnabled === true");
    expect(source("src/integrations/v3/rollout-probe.server.ts")).toContain(
      'p_key: "solaris_app_v3_results"',
    );
  });

  it("shares spoiler preferences, public publication authority and the existing Scoreboard", () => {
    const route = source("src/routes/results/index.tsx");
    expect(route).toContain("useAppExperiencePreferences()");
    expect(route).toContain("resolveShowPublication(show).results");
    expect(route).toContain("editionMap.get(show.edition_id)?.published === true");
    expect(route).toContain("publication?.jury_results");
    expect(route).toContain("publication?.televote_results");
    expect(source("src/components/v3/V3ResultsScreen.tsx")).toContain("<V3ScoreboardPresentation");
    expect(source("src/components/v3/V3ScoreboardPresentation.tsx")).not.toContain("?? rows[0]");
  });
});
