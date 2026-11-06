import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  V3_JURY_SHARE_CERTIFICATION_CATEGORIES,
  V3_JURY_SHARE_REQUIRED_ASSERTIONS,
  assessV3JuryShareCertificationReadiness,
  type V3JuryShareCertificationCategory,
} from "./v3-jury-share-certification";

const SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);
const ARTIFACT_SHA256 = "c".repeat(64);

function evidence(category: V3JuryShareCertificationCategory) {
  return {
    schemaVersion: 1,
    category,
    candidateSha: SHA,
    passed: true,
    assertions: [...V3_JURY_SHARE_REQUIRED_ASSERTIONS[category]],
    issues: [] as string[],
    source: {
      workflow: `jury-share-${category}`,
      runId: 100,
      runAttempt: 1,
      headSha: SHA,
      artifactSha256: ARTIFACT_SHA256,
    },
    certificationClaim: false,
  };
}

function completeEvidence() {
  return V3_JURY_SHARE_CERTIFICATION_CATEGORIES.map((category) => evidence(category));
}

describe("Jury Share JSC-12 certification readiness", () => {
  it("accepts complete exact-SHA evidence without claiming final V3 certification", () => {
    const result = assessV3JuryShareCertificationReadiness(completeEvidence(), SHA);

    expect(result.passed).toBe(true);
    expect(result.candidateSha).toBe(SHA);
    expect(result.observedCategories).toEqual(V3_JURY_SHARE_CERTIFICATION_CATEGORIES);
    expect(result.missingCategories).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.certificationClaim).toBe(false);
  });

  it("fails closed when a JSC-12 evidence category is missing", () => {
    const values = completeEvidence().filter((item) => item.category !== "mobile_pwa");
    const result = assessV3JuryShareCertificationReadiness(values, SHA);

    expect(result.passed).toBe(false);
    expect(result.missingCategories).toEqual(["mobile_pwa"]);
    expect(result.issues).toContain(
      "missing Jury Share certification evidence category: mobile_pwa",
    );
  });

  it("rejects duplicate categories rather than accepting whichever artifact happened to load last", () => {
    const values = completeEvidence();
    values.push(evidence("focused_integration"));

    const result = assessV3JuryShareCertificationReadiness(values, SHA);

    expect(result.passed).toBe(false);
    expect(result.issues).toContain(
      "duplicate Jury Share evidence category: focused_integration",
    );
  });

  it("rejects stale, failed or unresolved evidence", () => {
    const values = completeEvidence();
    const authorization = values.find((item) => item.category === "authorization_security");
    if (!authorization) throw new Error("authorization fixture missing");

    authorization.candidateSha = OTHER_SHA;
    authorization.source.headSha = OTHER_SHA;
    authorization.passed = false;
    authorization.issues = ["cross-edition rejection did not pass"];

    const result = assessV3JuryShareCertificationReadiness(values, SHA);
    const text = result.issues.join("\n");

    expect(result.passed).toBe(false);
    expect(text).toContain("evidence must report passed=true");
    expect(text).toContain("not exact candidate");
    expect(text).toContain("unresolved issue");
  });

  it("pins the detailed cross-side and historical cases from the Jury Share plan", () => {
    expect(V3_JURY_SHARE_REQUIRED_ASSERTIONS.focused_integration).toEqual(
      expect.arrayContaining([
        "results_share_entry",
        "me_history_share_entry",
        "public_country_share_policy",
        "canonical_projection",
        "render_output",
      ]),
    );
    expect(V3_JURY_SHARE_REQUIRED_ASSERTIONS.historical_identity).toEqual(
      expect.arrayContaining([
        "historical_ballot",
        "historical_name",
        "historical_flag",
        "archived_default_theme",
        "archived_edition_theme_when_available",
        "archived_liquid_glass",
        "unprovable_history_unavailable",
      ]),
    );
  });

  it("pins the surgical visual and browser/mobile golden matrices instead of generic theme labels", () => {
    expect(V3_JURY_SHARE_REQUIRED_ASSERTIONS.visual_golden).toEqual(
      expect.arrayContaining([
        "default_ordinary_country_names",
        "default_long_country",
        "default_dark_flag",
        "default_bright_flag",
        "edition_valid",
        "edition_missing_handled",
        "edition_invalid_handled",
        "edition_top_fade_artwork",
        "edition_full_background_artwork",
        "edition_extreme_artwork_brightness",
        "edition_custom_scoreboard",
        "liquid_glass_light_artwork_contamination",
        "liquid_glass_dark_background",
        "liquid_glass_complex_flags",
        "typography_hanvor",
        "typography_aekalin",
        "typography_long_multi_word_country",
        "typography_mixed_accented_characters",
        "safe_area",
      ]),
    );
    expect(V3_JURY_SHARE_REQUIRED_ASSERTIONS.mobile_pwa).toEqual(
      expect.arrayContaining([
        "iphone_open_share_sheet",
        "iphone_switch_theme",
        "iphone_generate",
        "native_share_supported",
        "file_share_fallback",
        "iphone_save_png",
        "desktop_generate",
        "desktop_save_png",
        "desktop_save_jpeg",
        "desktop_no_native_share_dependency",
        "reduced_motion",
        "large_text",
      ]),
    );
  });

  it("fails closed when representative correction, visual, mobile or isolation cases are omitted", () => {
    const values = completeEvidence();
    const isolation = values.find((item) => item.category === "production_isolation");
    const correction = values.find((item) => item.category === "result_correction");
    const visual = values.find((item) => item.category === "visual_golden");
    const mobile = values.find((item) => item.category === "mobile_pwa");
    if (!isolation || !correction || !visual || !mobile) {
      throw new Error("certification fixture missing");
    }

    isolation.assertions = ["local_or_isolated_only"];
    correction.assertions = ["published_version_change_invalidates_render"];
    visual.assertions = visual.assertions.filter(
      (assertion) =>
        ![
          "default_long_country",
          "edition_invalid_handled",
          "liquid_glass_complex_flags",
          "safe_area",
        ].includes(assertion),
    );
    mobile.assertions = mobile.assertions.filter(
      (assertion) => !["iphone_switch_theme", "desktop_save_jpeg"].includes(assertion),
    );

    const result = assessV3JuryShareCertificationReadiness(values, SHA);
    const text = result.issues.join("\n");

    expect(result.passed).toBe(false);
    expect(text).toContain("production_isolation: missing required assertion hosted_supabase_refused");
    expect(text).toContain("production_isolation: missing required assertion bounded_deterministic_seed");
    expect(text).toContain(
      "production_isolation: missing required assertion no_bulk_historical_production_scan",
    );
    expect(text).toContain(
      "result_correction: missing required assertion corrected_version_produces_new_render",
    );
    expect(text).toContain("visual_golden: missing required assertion default_long_country");
    expect(text).toContain("visual_golden: missing required assertion edition_invalid_handled");
    expect(text).toContain("visual_golden: missing required assertion liquid_glass_complex_flags");
    expect(text).toContain("visual_golden: missing required assertion safe_area");
    expect(text).toContain("mobile_pwa: missing required assertion iphone_switch_theme");
    expect(text).toContain("mobile_pwa: missing required assertion desktop_save_jpeg");
  });

  it("requires auditable exact-head CI artifact provenance", () => {
    const values = completeEvidence();
    const exact = values.find((item) => item.category === "exact_sha");
    if (!exact) throw new Error("exact SHA fixture missing");

    exact.source.workflow = "";
    exact.source.runId = 0;
    exact.source.runAttempt = 0;
    exact.source.artifactSha256 = "not-a-digest";

    const result = assessV3JuryShareCertificationReadiness(values, SHA);
    const text = result.issues.join("\n");

    expect(result.passed).toBe(false);
    expect(text).toContain("source workflow must be present");
    expect(text).toContain("source runId must be a positive integer");
    expect(text).toContain("source runAttempt must be a positive integer");
    expect(text).toContain("source artifactSha256 must be a 64-character SHA-256 digest");
  });

  it("keeps the QA command local, evidence-only and fail-closed", () => {
    const source = readFileSync("scripts/check-v3-jury-share-certification.ts", "utf8");

    expect(source).toContain("--require-ready");
    expect(source).toContain("V3_JURY_SHARE_QA_OUTPUT");
    expect(source).toContain("assessV3JuryShareCertificationReadiness");
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("curl ");
    expect(source).not.toContain("supabase.co");
  });
});
