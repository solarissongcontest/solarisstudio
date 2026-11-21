import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  VOTER_DECLARATION_LABELS,
  VOTER_INTEGRITY_MESSAGES,
  voterIntegrityMessage,
  voterIntegrityReasons,
  voterIntegrityErrorMessage,
} from "./voter-integrity-copy";
import { interventionRequiresAttestation, resolveIntegrityIntervention } from "./integrity-policy";
import { resolveJuryIntervention } from "@/integrations/jury-voting/jury-independence";

const juryPage = readFileSync("src/routes/jury-voting.tsx", "utf8");
const televoteBooth = readFileSync("src/components/televoting/TelevotingBooth.tsx", "utf8");
const canonicalStatements = readFileSync("src/integrations/televoting/integrity.ts", "utf8");
const juryServer = readFileSync("src/integrations/jury-voting/jury-integrity-v5.server.ts", "utf8");

describe("simple voting-integrity copy", () => {
  it("has a distinct, plain-language message for each server intervention", () => {
    expect(Object.keys(VOTER_INTEGRITY_MESSAGES).sort()).toEqual([
      "declaration", "enhanced_declaration", "none", "notice", "provisional_review", "review",
    ]);
    expect(voterIntegrityMessage(undefined)).toEqual(VOTER_INTEGRITY_MESSAGES.none);
    expect(voterIntegrityMessage("notice").title).toBe("Please check your votes");
    expect(voterIntegrityMessage("review").title).toBe("Your votes need another look");
    expect(voterIntegrityMessage("declaration").title).toBe("Please confirm your votes");
    expect(voterIntegrityMessage("enhanced_declaration").title).toBe("Your vote has been flagged for review");
    expect(voterIntegrityMessage("provisional_review").title).toBe("Your vote needs organizer review");
    expect(VOTER_INTEGRITY_MESSAGES.provisional_review.body).toContain("not proof");
  });

  it("uses the actual server decision, not a risk-score-only guess", () => {
    expect(resolveIntegrityIntervention({ risk: 90, confidence: 10 })).toBe("notice");
    expect(resolveIntegrityIntervention({ risk: 95, confidence: 90, currentCoordinationEvidence: false })).toBe("enhanced_declaration");
    expect(resolveIntegrityIntervention({ risk: 95, confidence: 90, currentCoordinationEvidence: true })).toBe("provisional_review");
    expect(resolveJuryIntervention({ risk: 90, confidence: 10, strongCurrentCoordinationEvidence: false })).toBe("review");
    expect(resolveJuryIntervention({ risk: 90, confidence: 90, strongCurrentCoordinationEvidence: false })).toBe("enhanced_declaration");
    expect(interventionRequiresAttestation("notice")).toBe(false);
    expect(interventionRequiresAttestation("review")).toBe(false);
    expect(interventionRequiresAttestation("provisional_review")).toBe(true);
  });

  it("explains known check, connection and declaration problems clearly", () => {
    expect(voterIntegrityErrorMessage(new Error("Voting integrity check expired. Review the ballot again."), "fallback")).toContain("expired");
    expect(voterIntegrityErrorMessage(new Error("Connection or device identity changed after the integrity check."), "fallback")).toContain("connection changed");
    expect(voterIntegrityErrorMessage(new Error("All voting-integrity declarations must be acknowledged"), "fallback")).toContain("all five statements");
    expect(voterIntegrityErrorMessage(new Error("Type the same username you registered with to sign the declaration"), "fallback")).toContain("username");
    expect(voterIntegrityErrorMessage(new Error("Unknown permission error"), "fallback")).toBe("Unknown permission error");
  });

  it("limits voter-facing reasons to safe general categories", () => {
    const reasons = voterIntegrityReasons(["reciprocal_pattern", "recent_persistence", "persistent_recent_pattern", "unknown_private_detector"]);
    expect(reasons.map((item) => item.title)).toEqual(["Mutual high scores", "Repeated recent support"]);
    expect(JSON.stringify(reasons)).not.toContain("unknown_private_detector");
    expect(voterIntegrityReasons(["jury_peer_deviation"])[0].title).toBe("Different from other juries");
    expect(voterIntegrityReasons()).toEqual([]);
    expect(juryServer).toContain("findings: []");
  });

  it("keeps the existing full signed declarations and server checks unchanged", () => {
    expect(Object.keys(VOTER_DECLARATION_LABELS)).toHaveLength(5);
    expect(canonicalStatements).toContain("VOTE_INTEGRITY_STATEMENT_VERSION = 2");
    expect(canonicalStatements).toContain("I did not take part in coordinated friend-voting");
    for (const page of [juryPage, televoteBooth]) {
      expect(page).toContain("VOTER_DECLARATION_LABELS.");
      expect(page).toContain("<VotingDeclarationCheckbox ");
      expect(page).toContain("fullText={VOTE_INTEGRITY_CONSEQUENCE}");
      expect(page).toContain("fullText={VOTE_INTEGRITY_AUTOMATION}");
      expect(page).toContain("fullText={VOTE_INTEGRITY_COORDINATION}");
      expect(page).not.toContain("report.riskScore}/100");
      expect(page).not.toContain("integrityReport.riskScore}/100");
    }
    expect(juryPage).toContain('setStage(nextReport.requiresAttestation ? "integrity" : "review")');
    expect(televoteBooth).toContain("if (report.requiresAttestation)");
    expect(televoteBooth).toContain("await attestVote(");
  });

  it("gives an honest receipt status when organizer review is required", () => {
    expect(juryPage).toContain('report?.interventionLevel === "provisional_review"');
    expect(televoteBooth).toContain('integrityReport?.interventionLevel === "provisional_review"');
    expect(televoteBooth).toContain("It has not been automatically rejected.");
  });
});
