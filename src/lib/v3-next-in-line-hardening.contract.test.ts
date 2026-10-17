import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const participantRoute = readFileSync(
  "src/routes/_authenticated/next-in-line.tsx",
  "utf8",
);
const boundary = readFileSync(
  "src/lib/confirmation-next-in-line.functions.ts",
  "utf8",
);
const participant = readFileSync(
  "src/components/NextInLineCompetition.tsx",
  "utf8",
);
const registry = readFileSync(
  "src/lib/v3-public-capability-registry.ts",
  "utf8",
);

describe("V3 Next in Line participant lifecycle", () => {
  it("preserves the canonical URL through the shared authenticated pathless layout", () => {
    expect(existsSync("src/routes/next-in-line.tsx")).toBe(false);
    expect(existsSync("src/routes/_authenticated/next-in-line.tsx")).toBe(true);
    expect(participantRoute).toContain('createFileRoute("/_authenticated/next-in-line")');
    expect(participantRoute).toContain("<NextInLineCompetition />");
    expect(participantRoute).toContain(
      '{ name: "robots", content: "noindex, nofollow" }',
    );
    expect(participantRoute).not.toContain("supabase.auth.getUser()");
    expect(participantRoute).not.toContain('to: "/auth"');
  });

  it("uses the authenticated System projection as participant scope and reconciliation truth", () => {
    expect(boundary).toContain('authenticatedRpc<unknown>("v3_my_next_in_line"');
    expect(boundary).toContain("parseV3NextInLineProjection(result, data.edition_id)");
    expect(participant).toContain("projection.contexts");
    expect(participant).toContain("This list is derived from your authenticated country/delegation authority");
    expect(participant).toContain("lastOperationId === operationId");
    expect(participant).not.toContain("setDone(");
    expect(participant).not.toContain("getNextInLineCountry");
  });

  it("submits through the idempotent V3 command and keeps retry identity stable", () => {
    expect(boundary).toContain('authenticatedRpc<unknown>("v3_submit_next_in_line"');
    expect(boundary).toContain("p_operation_id: operation_id");
    expect(boundary).toContain("p_idempotency_key: idempotency_key");
    expect(participant).toContain("pendingAttempt.current");
    expect(participant).toContain("existingAttempt?.fingerprint === fingerprint");
    expect(participant).toContain("Retry uses the same operation");
    expect(participant).toContain("reconcileAttempt(attempt.operationId");
  });

  it("keeps browser selectors subordinate to server authorization", () => {
    expect(boundary).toContain("v3_submit_next_in_line");
    expect(boundary).toContain("v3_my_next_in_line");
    expect(participant).toContain("selectedContext.country.name");
    expect(participant).toContain("selectedContext.sourceSubmissionId");
    expect(participant).toContain("Solaris re-checks delegation authority");
    expect(participant).not.toContain("countries.map((item)");
  });

  it("does not claim cutover before final browser and registry evidence", () => {
    const capabilityStart = registry.indexOf('id: "next-in-line"');
    const capabilityEnd = registry.indexOf("  },", capabilityStart);
    const capability = registry.slice(capabilityStart, capabilityEnd);

    expect(capabilityStart).toBeGreaterThan(-1);
    expect(capability).toContain('authRequirement: "authenticated"');
    expect(capability).toContain('acceptanceScenarioId: "public.next-in-line-lifecycle"');
    expect(capability).not.toContain('specificationStatus: "cutover"');
  });
});
