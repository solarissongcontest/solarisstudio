import { describe, expect, it } from "vitest";

import {
  GOVERNANCE_LIBRARY_DESTINATIONS,
  governanceLibraryGroups,
  searchGovernanceLibrary,
} from "@/lib/public-library-governance";
import type { RuleInterpretation } from "@/lib/rule-interpretations";
import type { RulebookRelease } from "@/lib/rules-governance";

const interpretation: RuleInterpretation = {
  id: "interpretation-1",
  code: "SSC-INT-2026-001",
  title: "Statistical friend-voting signals",
  question: "Can a high automated friend-voting score prove coordinated voting?",
  interpretation: "No. Statistical and automated signals are review indicators and do not establish misconduct by themselves.",
  rationale: "Voting-integrity findings require human review and contextual evidence.",
  rule_ids: ["11.5"],
  status: "published",
  effective_from: "2026-09-11T00:00:00Z",
  published_at: "2026-09-11T00:00:00Z",
  superseded_by: null,
};

const release: RulebookRelease = {
  id: "release-41",
  version: "4.1",
  status: "published",
  is_current: false,
  title: "Voting integrity clarifications",
  summary: "Clarifies how automated review indicators are interpreted.",
  base_version: "4.0",
  effective_from: "2026-09-12T00:00:00Z",
  published_at: "2026-09-11T00:00:00Z",
  changes: [
    {
      id: "change-1",
      rule_id: "11.5",
      change_kind: "modified",
      before_snapshot: null,
      after_snapshot: { title: "Automated Integrity Analysis", summary: "Automated signals trigger review, not guilt." },
      rationale: "Make the human-review safeguard explicit.",
    },
  ],
};

describe("public governance Library provider", () => {
  it("places the core Rules and Integrity destinations in the Library even before searching", () => {
    const results = searchGovernanceLibrary("");
    expect(results.map((result) => result.to)).toEqual(
      expect.arrayContaining([
        "/rules",
        "/rules/interpretations",
        "/rules/changes",
        "/integrity",
        "/integrity/preclearance",
        "/integrity/appeals",
      ]),
    );
  });

  it("finds the artist-reuse regulation directly", () => {
    const results = searchGovernanceLibrary("artist reuse");
    expect(results.some((result) => result.kind === "rule" && result.to === "/rules/6.6")).toBe(true);
  });

  it("returns a dedicated chapter result instead of only matching rules inside that chapter", () => {
    const results = searchGovernanceLibrary("entry eligibility");
    expect(results.some((result) => result.kind === "chapter" && result.id === "chapter-6")).toBe(true);
  });

  it("understands participant shorthand instead of requiring legal wording", () => {
    expect(searchGovernanceLibrary("FV").some((result) => result.to.startsWith("/rules/11."))).toBe(true);
    expect(searchGovernanceLibrary("DQ").some((result) => result.to === "/rules/17.2" || result.to.startsWith("/rules/17."))).toBe(true);
    expect(searchGovernanceLibrary("ESC").some((result) => result.to.startsWith("/rules/6."))).toBe(true);
  });

  it("finds appeals as both a participant action and a regulation topic", () => {
    const results = searchGovernanceLibrary("appeal");
    expect(results.some((result) => result.to === "/integrity/appeals")).toBe(true);
    expect(results.some((result) => result.to.startsWith("/rules/18."))).toBe(true);
  });

  it("finds the Integrity Centre from privacy and reporting language", () => {
    expect(searchGovernanceLibrary("anonymous report").some((result) => result.to === "/integrity")).toBe(true);
    expect(searchGovernanceLibrary("sealed identity").some((result) => result.to === "/integrity")).toBe(true);
  });

  it("finds private rule rulings from pre-clearance and before-you-act language", () => {
    expect(searchGovernanceLibrary("preclearance").some((result) => result.to === "/integrity/preclearance")).toBe(true);
    expect(searchGovernanceLibrary("private ruling").some((result) => result.to === "/integrity/preclearance")).toBe(true);
    expect(searchGovernanceLibrary("before you act").some((result) => result.to === "/integrity/preclearance")).toBe(true);
  });

  it("indexes published Official Interpretations supplied by the Library host", () => {
    const results = searchGovernanceLibrary("statistical friend voting", [interpretation]);
    expect(results.some((result) => result.id === `interpretation-${interpretation.id}`)).toBe(true);
    expect(results.find((result) => result.id === `interpretation-${interpretation.id}`)?.badge).toBe("Interpretation");
  });

  it("does not expose draft interpretations", () => {
    const draft = { ...interpretation, id: "draft-1", status: "draft" as const };
    expect(searchGovernanceLibrary("statistical friend voting", [draft]).some((result) => result.id === "interpretation-draft-1")).toBe(false);
  });

  it("indexes individual published rulebook releases and their change rationale", () => {
    const byVersion = searchGovernanceLibrary("v4.1", [], [release]);
    expect(byVersion.some((result) => result.kind === "release" && result.id === "release-release-41")).toBe(true);

    const byRationale = searchGovernanceLibrary("human review safeguard", [], [release]);
    expect(byRationale.some((result) => result.kind === "release" && result.id === "release-release-41")).toBe(true);
  });

  it("never indexes draft rulebook releases", () => {
    const draft = { ...release, id: "draft-release", version: "4.2-draft", status: "draft" as const };
    expect(searchGovernanceLibrary("4.2 draft", [], [draft]).some((result) => result.kind === "release")).toBe(false);
  });

  it("never exposes organizer routes through the public Library provider", () => {
    const queries = ["", "rule", "appeal", "integrity", "sanction", "interpretation", "preclearance"];
    const routes = queries.flatMap((query) => searchGovernanceLibrary(query, [interpretation], [release]).map((result) => result.to));
    expect(routes.some((route) => route.startsWith("/admin"))).toBe(false);
  });

  it("groups results into governance and integrity sections for the Library UI", () => {
    const groups = governanceLibraryGroups(GOVERNANCE_LIBRARY_DESTINATIONS);
    expect(groups.map((item) => item.group)).toEqual(["Rules & governance", "Trust & Integrity"]);
    expect(groups.every((item) => item.results.length > 0)).toBe(true);
  });
});
