import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = () =>
  readFileSync(
    resolve(process.cwd(), "src/lib/v3-rollout-state-ledger.ts"),
    "utf8",
  );

describe("Solaris Studio V3 rollout state ledger architecture", () => {
  it("composes release evidence and rollout transition contracts", () => {
    const ledger = source();
    expect(ledger).toContain('from "./v3-release-candidate-evidence"');
    expect(ledger).toContain('from "./v3-rollout-promotion-sequence"');
    expect(ledger).toContain("evaluateV3RolloutTransition");
    expect(ledger).toContain("rollbackV3Rollout");
    expect(ledger).not.toContain("evaluateV3WorkflowCutover");
    expect(ledger).not.toContain("evaluateV3RolloutObservability");
  });

  it("requires optimistic revision comparison for every authoritative write", () => {
    const ledger = source();
    expect(ledger).toContain("expectedRevision !== input.current.revision");
    expect(ledger).toContain('status: "stale_revision"');
    expect(ledger).toContain("input.current.revision + 1");
    expect(ledger).toContain("record update atomically");
  });

  it("does not fake idempotency from an operation id", () => {
    const ledger = source();
    expect(ledger).toContain("fictional idempotent success");
    expect(ledger).toContain("stale_revision");
    expect(ledger).not.toContain("operationId");
    expect(ledger).not.toContain("lastOperationId");
  });

  it("persists stable deployment identity rather than rollout-policy identity", () => {
    const ledger = source();
    expect(ledger).toContain("deploymentIdentityKey");
    expect(ledger).toContain("ledger.state.deploymentIdentityKey");
    expect(ledger).not.toContain("rolloutPolicyUpdatedAt");
    expect(ledger).not.toContain("observationIdentityKey");
  });

  it("supports same-stage observation epoch reset for rollout-policy changes", () => {
    const ledger = source();
    expect(ledger).toContain("applyV3RolloutObservationEpochReset");
    expect(ledger).toContain('kind: "observation_epoch_reset"');
    expect(ledger).toContain("policyRef");
    expect(ledger).toContain("preserving the same deployment and rollout stage");
    expect(ledger).toContain("pre-change telemetry cannot be reused");
  });

  it("locks persisted history and authoritative timestamp invariants", () => {
    const ledger = source();
    expect(ledger).toContain(
      "ledger.updatedAt must equal the authoritative state.enteredAt timestamp",
    );
    expect(ledger).toContain(
      "revision 0 rollout ledger must be pristine legacy state with no last change",
    );
    expect(ledger).toContain("revisioned rollout ledger must retain its last change");
    expect(ledger).toContain(
      "ledger last-change destination must match the persisted rollout stage",
    );
    expect(ledger).toContain(
      "observation epoch reset must preserve the current rollout stage",
    );
    expect(ledger).toContain("serverTime cannot be before ledger.updatedAt");
  });

  it("keeps safety rollback evidence-free but revision-controlled", () => {
    const ledger = source();
    expect(ledger).toContain("applyV3RolloutRollback");
    expect(ledger).toContain("reasonRef");
    expect(ledger).toContain("Immediate safety rollback");
  });

  it("cannot own database/network/browser persistence or client time", () => {
    const ledger = source();
    for (const forbidden of [
      "@supabase",
      "createClient(",
      "supabase.",
      ".from(",
      "fetch(",
      "localStorage",
      "sessionStorage",
      "useEffect(",
      "useQuery(",
      "useMutation(",
      "setInterval(",
      "setTimeout(",
      "Date.now(",
      "new Date(",
    ]) {
      expect(ledger).not.toContain(forbidden);
    }
  });
});
