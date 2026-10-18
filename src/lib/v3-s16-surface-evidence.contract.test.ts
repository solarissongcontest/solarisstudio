import { describe, expect, it } from "vitest";
import {
  V3_S16_ACCESSIBILITY_REQUIRED_CASES,
  V3_S16_NAVIGATION_REQUIRED_CASES,
  V3_S16_RESPONSIVE_REQUIRED_CASES,
  requiredV3S16OrganizerAcceptanceCases,
  requiredV3S16PublicAcceptanceCases,
  validateV3S16SurfaceEvidence,
  type V3S16SurfaceCategory,
} from "./v3-s16-surface-evidence-contract";

const SHA = "a".repeat(40);

function evidence(category: V3S16SurfaceCategory, ids: readonly string[]) {
  return {
    schemaVersion: 1,
    candidateSha: SHA,
    category,
    passed: true,
    cases: ids.map((id) => ({ id, passed: true, evidence: [`proof:${id}`] })),
    provenance: { kind: "hybrid", source: "exact-candidate acceptance run" },
  };
}

describe("S16 surface acceptance evidence", () => {
  it("uses the canonical Session-4 navigation golden set", () => {
    expect(V3_S16_NAVIGATION_REQUIRED_CASES).toEqual([
      "standard-phone",
      "tiny-phone",
      "large-text",
      "reduced-motion",
      "reduced-transparency",
      "standalone-pwa",
      "browser-mode",
      "orientation-change",
      "keyboard-open",
      "scroll-compact-state",
      "drag-interaction",
      "edge-drag",
      "focused-task-shell",
    ]);
  });

  it("keeps accessibility and responsive release cases explicit", () => {
    expect(V3_S16_ACCESSIBILITY_REQUIRED_CASES).toEqual([
      "keyboard",
      "large-text",
      "reduced-motion",
      "reduced-transparency",
    ]);
    expect(V3_S16_RESPONSIVE_REQUIRED_CASES).toEqual([
      "standard-phone",
      "tiny-phone",
      "orientation-change",
      "keyboard-open",
      "standalone-pwa",
      "browser-mode",
    ]);
  });

  it("derives Public acceptance cases from canonical capability acceptanceScenarioIds", () => {
    const required = requiredV3S16PublicAcceptanceCases();
    expect(required.length).toBeGreaterThan(0);
    expect(new Set(required).size).toBe(required.length);
    expect(required.every((id) => id.trim().length > 0)).toBe(true);
  });

  it("derives Organizer acceptance cases from the canonical capability registry", () => {
    const required = requiredV3S16OrganizerAcceptanceCases();
    expect(required.length).toBeGreaterThan(0);
    expect(new Set(required).size).toBe(required.length);
  });

  it("rejects stale exact-SHA evidence", () => {
    const input = evidence("navigation-acceptance", V3_S16_NAVIGATION_REQUIRED_CASES);
    input.candidateSha = "b".repeat(40);
    expect(validateV3S16SurfaceEvidence(input, "navigation-acceptance", SHA)).toContain(
      `navigation-acceptance: evidence certifies ${"b".repeat(40)}, not exact candidate ${SHA}`,
    );
  });

  it("rejects a required case without evidence references", () => {
    const input = evidence("navigation-acceptance", V3_S16_NAVIGATION_REQUIRED_CASES);
    input.cases[0].evidence = [];
    expect(
      validateV3S16SurfaceEvidence(input, "navigation-acceptance", SHA),
    ).toContain(
      `navigation-acceptance: required acceptance case ${V3_S16_NAVIGATION_REQUIRED_CASES[0]} has no evidence references`,
    );
  });

  it("rejects missing and duplicate required cases", () => {
    const input = evidence("responsive-behavior", V3_S16_RESPONSIVE_REQUIRED_CASES.slice(1));
    input.cases.push({ ...input.cases[0] });
    const issues = validateV3S16SurfaceEvidence(input, "responsive-behavior", SHA);
    expect(issues.some((issue) => issue.includes("required acceptance case standard-phone appears 0 times"))).toBe(true);
    expect(issues.some((issue) => issue.includes("duplicate acceptance case"))).toBe(true);
  });

  it("requires provenance for every surface acceptance claim", () => {
    const input = evidence("accessibility", V3_S16_ACCESSIBILITY_REQUIRED_CASES);
    (input as { provenance?: unknown }).provenance = undefined;
    expect(validateV3S16SurfaceEvidence(input, "accessibility", SHA)).toContain(
      "accessibility: provenance is required",
    );
  });
});
