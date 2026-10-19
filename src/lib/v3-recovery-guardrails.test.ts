import { describe, expect, it } from "vitest";
import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";
import {
  V3_MAX_RECOVERY_BATCH,
  buildV3RecoveryReadinessReport,
  planV3DeadLetterReplay,
  planV3ProjectionRecovery,
  planV3ProjectionRecoveryBatch,
} from "./v3-recovery-guardrails";

function projectionForDomain(domain: string) {
  const projection = V3_PROJECTION_RECONCILIATION_REGISTRY.find((candidate) =>
    candidate.canonicalDomains.includes(domain),
  );
  if (!projection) throw new Error(`Missing projection fixture for domain ${domain}`);
  return projection.projection;
}

describe("System V3 S11 recovery guardrails", () => {
  it("plans only canonical bounded projection rebuild contracts", () => {
    const taskProjection = projectionForDomain("task");
    const plan = planV3ProjectionRecovery(taskProjection, {
      editionId: "11111111-1111-4111-8111-111111111111",
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(plan.status).toBe("ready");
    expect(plan.kind).toBe("projection_rebuild");
    expect(plan.canonicalPath).toContain("studio2_reconcile_all_organizer_tasks");
    expect(plan.verificationPath).toContain("canonical domain task sources");
    expect(plan.maxMutations).toBe(1);
    expect(plan.mutatesCanonicalDomainState).toBe(false);
    expect(plan.boundedBy).toContain("one edition");
    expect(plan.scope).toEqual({ editionId: "11111111-1111-4111-8111-111111111111" });
  });

  it("requires the exact valid repair scope before permitting a rebuild", () => {
    const receiptProjection = projectionForDomain("receipt");
    const missingScope = planV3ProjectionRecovery(receiptProjection, {});
    expect(missingScope.status).toBe("blocked");
    expect(missingScope.blockedReason).toBe("required_scope_missing");

    const malformedScope = planV3ProjectionRecovery(receiptProjection, {
      operationId: "definitely-not-an-operation-id",
    });
    expect(malformedScope.status).toBe("blocked");
    expect(malformedScope.blockedReason).toBe("invalid_scope_id");

    const scoped = planV3ProjectionRecovery(receiptProjection, {
      operationId: "22222222-2222-4222-8222-222222222222",
    });
    expect(scoped.status).toBe("ready");
    expect(scoped.canonicalPath).toContain("studio2_reconcile_operation");
    expect(scoped.maxMutations).toBe(1);
  });

  it("fails closed when the canonical registry has only foundation repair evidence", () => {
    const confirmationProjection = projectionForDomain("confirmation");
    const plan = planV3ProjectionRecovery(confirmationProjection, {
      editionId: "33333333-3333-4333-8333-333333333333",
    });

    expect(plan.status).toBe("blocked");
    expect(plan.blockedReason).toBe("canonical_rebuild_contract_missing");
    expect(plan.canonicalPath).toContain("studio2_reconcile_confirmation_requirements");
    expect(plan.verificationPath).toContain("studio2_verify_confirmation_requirements");
    expect(plan.maxMutations).toBe(0);
  });

  it("fails closed for unknown projections", () => {
    const plan = planV3ProjectionRecovery("projection-that-does-not-exist", {});
    expect(plan.status).toBe("blocked");
    expect(plan.blockedReason).toBe("unknown_projection");
    expect(plan.maxMutations).toBe(0);
  });

  it("bounds projection recovery batches, rejects duplicates, and refuses all-or-nothing execution when one item is unsafe", () => {
    const taskProjection = projectionForDomain("task");
    const safeBatch = planV3ProjectionRecoveryBatch(taskProjection, [
      { editionId: "11111111-1111-4111-8111-111111111111" },
      { editionId: "22222222-2222-4222-8222-222222222222" },
    ]);
    expect(safeBatch.status).toBe("ready");
    expect(safeBatch.plans).toHaveLength(2);
    expect(safeBatch.maxBatchSize).toBe(V3_MAX_RECOVERY_BATCH);

    const duplicateBatch = planV3ProjectionRecoveryBatch(taskProjection, [
      { editionId: "11111111-1111-4111-8111-111111111111" },
      {
        editionId: "11111111-1111-4111-8111-111111111111",
        actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    ]);
    expect(duplicateBatch.status).toBe("blocked");
    expect(duplicateBatch.blockedReason).toBe("duplicate_scope");

    const mixedBatch = planV3ProjectionRecoveryBatch(taskProjection, [
      { editionId: "11111111-1111-4111-8111-111111111111" },
      {},
    ]);
    expect(mixedBatch.status).toBe("blocked");
    expect(mixedBatch.blockedReason).toBe("required_scope_missing");

    const oversized = planV3ProjectionRecoveryBatch(
      taskProjection,
      Array.from({ length: V3_MAX_RECOVERY_BATCH + 1 }, (_, index) => ({
        editionId: `${index}`,
      })),
    );
    expect(oversized.status).toBe("blocked");
    expect(oversized.blockedReason).toBe("batch_limit_exceeded");
    expect(oversized.plans).toEqual([]);
  });

  it("uses the canonical service-role dead-letter requeue path one delivery at a time", () => {
    const plan = planV3DeadLetterReplay({
      eventId: "44444444-4444-4444-8444-444444444444",
      consumerKey: "notification.delivery",
    });

    expect(plan.status).toBe("ready");
    expect(plan.canonicalPath).toContain("studio2_requeue_dead_letter_domain_event");
    expect(plan.requiresServiceRole).toBe(true);
    expect(plan.maxMutations).toBe(1);
    expect(plan.scope).toEqual({
      eventId: "44444444-4444-4444-8444-444444444444",
      consumerKey: "notification.delivery",
      resetAttempts: false,
    });
    expect(plan.verificationPath).toContain("exactly one immutable consumer receipt");
  });

  it("rejects malformed dead-letter replay identity instead of attempting broad recovery", () => {
    expect(
      planV3DeadLetterReplay({ eventId: "not-a-uuid", consumerKey: "notification.delivery" }),
    ).toMatchObject({ status: "blocked", blockedReason: "invalid_event_id", maxMutations: 0 });

    expect(
      planV3DeadLetterReplay({
        eventId: "44444444-4444-4444-8444-444444444444",
        consumerKey: "NOT ALLOWED",
      }),
    ).toMatchObject({ status: "blocked", blockedReason: "invalid_consumer_key", maxMutations: 0 });
  });

  it("produces machine-readable recovery readiness without claiming missing rebuilds exist", () => {
    const report = buildV3RecoveryReadinessReport();
    expect(report.schemaVersion).toBe(1);
    expect(report.maxBatchSize).toBe(V3_MAX_RECOVERY_BATCH);
    expect(report.rebuildableProjectionCount).toBeGreaterThan(0);
    expect(report.blockedProjectionCount).toBeGreaterThan(0);
    expect(report.rebuildableProjections.every((item) => item.rebuildPath && item.verificationPath)).toBe(true);
    expect(report.blockedProjections.some((item) => item.repairState === "foundation")).toBe(true);
    expect(report.deadLetterReplay.resetAttemptsDefault).toBe(false);
  });
});
