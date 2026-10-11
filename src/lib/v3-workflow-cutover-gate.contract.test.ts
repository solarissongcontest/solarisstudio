import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(resolve(process.cwd(), "src/lib/v3-workflow-cutover-gate.ts"), "utf8");

describe("Solaris Studio V3 critical workflow cutover architecture", () => {
  it("keeps the gate pure and unable to mutate rollout or production state", () => {
    const gate = source();

    expect(gate).not.toContain("@supabase");
    expect(gate).not.toContain("createClient(");
    expect(gate).not.toContain("fetch(");
    expect(gate).not.toContain("localStorage");
    expect(gate).not.toContain("sessionStorage");
    expect(gate).not.toContain("useEffect(");
    expect(gate).not.toContain("useMutation(");
  });

  it("requires the shared critical-mutation protections before participant cutover", () => {
    const gate = source();

    expect(gate).toContain('"canonicalReadParity"');
    expect(gate).toContain('"canonicalWriteReady"');
    expect(gate).toContain('"idempotencyProtection"');
    expect(gate).toContain('"uncertainOutcomeReconciliation"');
    expect(gate).toContain('"authoritativeReceipts"');
    expect(gate).toContain('"rollbackPath"');
    expect(gate).toContain('"legacyFallbackAvailable"');
    expect(gate).toContain('"serverControlledRollout"');
  });

  it("requires all four product verification gates on the actual cutover candidate", () => {
    const gate = source();

    expect(gate).toContain('"functional"');
    expect(gate).toContain('"visual"');
    expect(gate).toContain('"interaction"');
    expect(gate).toContain('"infrastructure"');
    expect(gate).toContain("has not passed on the cutover candidate");
  });

  it("keeps workflow-specific guarantees explicit instead of flattening every workflow into one checklist", () => {
    const gate = source();

    expect(gate).toContain('confirmation: ["revisionSafeDrafts"]');
    expect(gate).toContain(
      'entry: ["revisionSafeDrafts", "immutableSubmittedVersion"]',
    );
    expect(gate).toContain('media: ["verifiedMediaPipeline"]');
    expect(gate).toContain(
      'jury: ["revisionSafeDrafts", "officialBallotValidation"]',
    );
    expect(gate).toContain(
      'televote: ["officialBallotValidation", "duplicateEvidenceReconciliation"]',
    );
  });

  it("lets shadow mode measure parity without granting mutation ownership", () => {
    const gate = source();

    expect(gate).toContain('if (stage === "shadow")');
    expect(gate).toContain('"canonicalReadReady"');
    expect(gate).toContain("Parity itself is deliberately NOT a prerequisite");
    expect(gate).toContain('"legacyFallbackAvailable"');
    expect(gate).toContain('"serverControlledRollout"');
  });

  it("prevents legacy removal from being treated as an ordinary feature-flag flip", () => {
    const gate = source();

    expect(gate).toContain('if (stage === "retire_legacy")');
    expect(gate).toContain("Legacy retirement is premature");
    expect(gate).toContain("evidence.legacyFallbackAvailable");
  });

  it("states that prior/manual confidence is not candidate evidence", () => {
    const gate = source();

    expect(gate).toContain('"we tested this earlier"');
    expect(gate).toContain("current candidate");
  });
});
