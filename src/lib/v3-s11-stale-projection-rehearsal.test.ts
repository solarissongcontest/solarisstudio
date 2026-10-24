import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_FAILURE_INJECTION_COVERAGE } from "./v3-failure-injection-coverage";
import { v3ProjectionReconciliation } from "./v3-projection-reconciliation-registry";

const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s11-stale-projection-rehearsal.sh"),
  "utf8",
);

describe("System V3 S11 stale projection recovery rehearsal", () => {
  it("uses the declared bounded Organizer Task rebuild contract", () => {
    const taskProjection = v3ProjectionReconciliation("studio2_organizer_tasks");
    expect(taskProjection?.repair.state).toBe("rebuildable");
    expect(taskProjection?.repair.scope).toBe("edition");
    expect(taskProjection?.repair.rebuildPath).toContain(
      "private.studio2_reconcile_all_organizer_tasks(edition_id)",
    );
    expect(rehearsal).toContain("private.studio2_reconcile_all_organizer_tasks(");
    expect(rehearsal).toContain("'87000000-0000-4000-8000-000000000011'::uuid");
  });

  it("hard-refuses hosted database rehearsal targets", () => {
    expect(rehearsal).toContain("Refusing hosted/non-local database rehearsal");
    expect(rehearsal).toContain("127.0.0.1");
    expect(rehearsal).toContain("localhost");
  });

  it("corrupts only the derived task projection while retaining canonical scheduler truth", () => {
    expect(rehearsal).toContain("delete from public.studio2_organizer_tasks");
    expect(rehearsal).toContain("from cron.job");
    expect(rehearsal).toContain("Canonical source changed while corrupting projection");
    expect(rehearsal).toContain("rollback;");
  });

  it("injects a deterministic first rebuild failure and proves retry safety", () => {
    expect(rehearsal).toContain("V3_S11_SYNTHETIC_PROJECTION_WRITE_FAILURE");
    expect(rehearsal).toContain("Failed rebuild left a partial fixture projection behind");
    expect(rehearsal).toContain("Failed rebuild mutated canonical scheduler truth");
    expect(rehearsal).toContain("Retry did not restore exactly one fixture task");
    expect(rehearsal).toContain("Repeated reconciliation duplicated or lost the repaired task");
  });

  it("verifies semantic projection convergence rather than timestamp equality", () => {
    for (const field of [
      "sourceKind",
      "sourceId",
      "sourceKey",
      "taskType",
      "requiredCapability",
      "priority",
      "state",
      "title",
      "description",
      "href",
      "resolutionPredicate",
    ]) {
      expect(rehearsal).toContain(`'${field}'`);
    }
    expect(rehearsal).toContain("v_actual is distinct from v_expected");
  });

  it("keeps each implemented S11 repair path rehearsal-ready until retained execution evidence exists", () => {
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "stale_projection")?.state,
    ).toBe("rehearsal_ready");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "reconciliation_retry")?.state,
    ).toBe("rehearsal_ready");
    expect(
      V3_FAILURE_INJECTION_COVERAGE.find((entry) => entry.scenario === "queue_backlog")?.state,
    ).toBe("rehearsal_ready");
  });
});
