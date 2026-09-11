import { describe, expect, it } from "vitest";

import {
  GOVERNANCE_LIBRARY_DESTINATIONS,
  governanceLibraryGroups,
  searchGovernanceLibrary,
} from "@/lib/public-library-governance";
import type { RuleInterpretation } from "@/lib/rule-interpretations";

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

describe("public governance Library provider", () => {
  it("places the core Rules and Integrity destinations in the Library even before searching", () => {
    const results = searchGovernanceLibrary("");
    expect(results.map((result) => result.to)).toEqual(
      expect.arrayContaining([
        "/rules",
        "/rules/interpretations",
        "/rules/changes",
        "/integrity",
        "/integrity/appeals",
      ]),
    );
  });

  it("finds the artist-reuse regulation directly", () => {
    const results = searchGovernanceLibrary("artist reuse");
    expect(results.some((result) => result.kind === "rule" && result.to === "/rules/6.6")).toBe(true);
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

  it("indexes published Official Interpretations supplied by the Library host", () => {
    const results = searchGovernanceLibrary("statistical friend voting", [interpretation]);
    expect(results.some((result) => result.id === `interpretation-${interpretation.id}`)).toBe(true);
    expect(results.find((result) => result.id === `interpretation-${interpretation.id}`)?.badge).toBe("Interpretation");
  });

  it("does not expose draft interpretations", () => {
    const draft = { ...interpretation, id: "draft-1", status: "draft" as const };
    expect(searchGovernanceLibrary("statistical friend voting", [draft]).some((result) => result.id === "interpretation-draft-1")).toBe(false);
  });

  it("never exposes organizer routes through the public Library provider", () => {
    const queries = ["", "rule", "appeal", "integrity", "sanction", "interpretation"];
    const routes = queries.flatMap((query) => searchGovernanceLibrary(query, [interpretation]).map((result) => result.to));
    expect(routes.some((route) => route.startsWith("/admin"))).toBe(false);
  });

  it("groups results into governance and integrity sections for the Library UI", () => {
    const groups = governanceLibraryGroups(GOVERNANCE_LIBRARY_DESTINATIONS);
    expect(groups.map((item) => item.group)).toEqual(["Rules & governance", "Trust & Integrity"]);
    expect(groups.every((item) => item.results.length > 0)).toBe(true);
  });
});
