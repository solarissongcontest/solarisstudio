import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as consequenceRegistry from "./v3-domain-consequence-registry";
import type { V3DomainConsequence } from "./v3-domain-consequence-registry";
const {
  V3_DOMAIN_CONSEQUENCE_REGISTRY,
  isResolvedV3DomainConsequence,
  isV3ReadOnlyConsequenceReplacement,
  v3DomainConsequence,
  v3DomainConsequenceImplementationErrors,
} = consequenceRegistry;
import {
  V3_PROJECTION_RECONCILIATION_REGISTRY,
  v3ProjectionsInvalidatedByEvent,
} from "./v3-projection-reconciliation-registry";

function reconciliation() {
  const row = v3DomainConsequence("receipt.reconciled");
  if (!row) throw new Error("Canonical reconciliation catalog identity is missing");
  return row;
}

describe("canonical receipt reconciliation read replaces a phantom mutation event", () => {
  it("preserves the catalog identity and points to the existing bounded actor-scoped operation", () => {
    const row = reconciliation();
    expect(row.implementationState).toBe("replaced-by-read");
    expect(row.ownerDomain).toBe("receipt");
    expect(row.replacement).toMatchObject({
      kind: "canonical-read",
      ownerDomain: "receipt",
      operation: "public.studio2_reconcile_operation(uuid)",
      boundedBy: "one operation id per invocation",
    });
    expect(row.evidence).toContain("src/lib/system-operation-reconciliation.server.ts");
    expect(isResolvedV3DomainConsequence(row)).toBe(true);
    expect(isV3ReadOnlyConsequenceReplacement(row)).toBe(true);
    expect(v3DomainConsequenceImplementationErrors(row)).toEqual([]);
    for (const path of row.replacement?.evidence ?? []) {
      expect(readFileSync(path, "utf8").length).toBeGreaterThan(0);
    }
  });

  it("does not publish or invalidate the durable receipt just because it was read", () => {
    const row = reconciliation();
    for (const effects of [
      row.taskEffects, row.notificationEffects, row.publicationEffects,
      row.realtimeEffects, row.analyticsEffects,
    ]) expect(effects).toEqual([]);
    expect(row.auditRequired).toBe(false);
    expect(v3ProjectionsInvalidatedByEvent("receipt.reconciled")).toEqual([]);
    const receiptProjections = V3_PROJECTION_RECONCILIATION_REGISTRY.filter(
      (projection) => projection.canonicalDomains.includes("receipt"),
    );
    expect(receiptProjections.length).toBeGreaterThan(0);
    for (const projection of receiptProjections) {
      expect(projection.invalidatingEvents).not.toContain("receipt.reconciled");
      expect(projection.invalidatingEvents).toContain("receipt.recorded");
      expect(projection.repair.rebuildPath).toContain("studio2_reconcile_operation");
    }
  });

  it("keeps every genuine declared mutation blocked and retains actual S4 requirements", () => {
    const declared = V3_DOMAIN_CONSEQUENCE_REGISTRY.filter((row) => row.implementationState === "declared");
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.every((row) => !isResolvedV3DomainConsequence(row))).toBe(true);
    for (const event of ["receipt.recorded", "edition.changed", "identity.signed_out"]) {
      const row = v3DomainConsequence(event);
      expect(row?.implementationState).toBe("declared");
      expect(row && isResolvedV3DomainConsequence(row)).toBe(false);
    }
    expect(v3DomainConsequence("results.calculated")?.implementationState).toBe("event-backed");
    const results = v3DomainConsequence("results.calculated");
    expect(results && isResolvedV3DomainConsequence(results)).toBe(true);
    expect(results && isResolvedV3DomainConsequence({ ...results, evidence: [] })).toBe(false);
  });

  it("rejects forged read replacements, delivery effects, missing proof and unknown states", () => {
    const row = reconciliation();
    const actual = row.replacement!;
    const invalid: V3DomainConsequence[] = [
      { ...row, eventType: "receipt.recorded" },
      { ...row, ownerDomain: "entry" },
      { ...row, replacement: null },
      { ...row, replacement: { ...actual, operation: "public.unproven_mutation(uuid)" } },
      { ...row, replacement: { ...actual, evidence: [] } },
      { ...row, evidence: [] },
      { ...row, analyticsEffects: ["invented-mutation"] },
      { ...row, realtimeEffects: [{ effect: "invalidate-projection", projection: "user receipt" }] },
      { ...row, taskEffects: [{ effect: "re-evaluate", taskType: "unimplemented.task" }] },
      { ...row, auditRequired: true },
      { ...row, implementationState: "event-backed", replacement: null },
      { ...row, implementationState: "declared" },
      { ...row, implementationState: "complete" as V3DomainConsequence["implementationState"] },
    ];
    for (const candidate of invalid) {
      expect(isResolvedV3DomainConsequence(candidate)).toBe(false);
    }
  });

  it("ties the replacement to the actual STABLE SELECT-only server implementation and local runtime proof", () => {
    const sql = readFileSync(
      "supabase/migrations/20261014194651_v3_s2_operation_receipt_idempotency.sql", "utf8",
    );
    const start = sql.indexOf("create or replace function public.studio2_reconcile_operation(");
    const end = sql.indexOf("$reconcile$;", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const definition = sql.slice(start, end);
    expect(definition).toMatch(/\bstable\b/i);
    expect(definition).toContain("v_actor uuid := auth.uid()");
    expect(definition).toContain("receipt.operation_id = p_operation_id");
    expect(definition).toContain("receipt.actor_id = v_actor");
    const body = definition.slice(definition.indexOf("as $reconcile$") + "as $reconcile$".length);
    expect(body).not.toMatch(/\b(insert|update|delete|merge|truncate|alter|create|drop|perform|execute|call|nextval|set_config)\b/i);
    const rehearsal = readFileSync(".github/scripts/v3-operation-receipt-rehearsal.sh", "utf8");
    expect(rehearsal).toContain("own operation reconciliation");
    expect(rehearsal).toContain("foreign actor reconciliation");
    expect(rehearsal).toContain("Repeated readback changed the authoritative receipt");
    expect(rehearsal).toContain("Read-only reconciliation mutated receipts or enqueued new DomainEvent/outbox state");
    expect(rehearsal).toContain("select provolatile from pg_proc");
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
  });
});
