import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/participant-status/$slug.tsx"),
  "utf8",
);

describe("V3 Organizer Participant Status uncertain-result reconciliation", () => {
  it("validates the exact apply result before claiming success", () => {
    expect(route).toContain('const { data, error } = await (supabase as any).rpc(\n        "studio2_apply_participation_status"');
    expect(route).toContain("validateParticipationStatusExecution(data, pending, commandEditionId)");
    expect(route).toContain('row.riskClass !== "R2"');
    expect(route).toContain("row.editionId !== editionId");
    expect(route).toContain("row.operationId !== pending.operationId");
    expect(route).toContain("row.status !== expectedStatus");
  });

  it("reconciles the same immutable operation identity after an ambiguous apply failure", () => {
    expect(route).toContain('import { normalizeSystemReceipt } from "@/lib/system-receipt"');
    expect(route).toContain('"studio2_reconcile_operation"');
    expect(route).toContain("{ p_operation_id: pending.operationId }");
    expect(route).toContain("receipt.operationId !== pending.operationId");
    expect(route).toContain("receipt.command !== `participation.status.${pending.preview.requestedStatus}`");
    expect(route).toContain('receipt.status !== "succeeded"');
    expect(route).toContain("validateParticipationStatusExecution(receipt.result, pending, pending.preview.editionId)");
  });

  it("refreshes canonical dependent projections after direct success or reconciled success", () => {
    expect(route).toContain("async function refreshParticipationState()");
    expect(route).toContain('qc.invalidateQueries({ queryKey: ["participants"] })');
    expect(route).toContain('qc.invalidateQueries({ queryKey: ["public-participants"] })');
    expect(route).toContain('qc.invalidateQueries({ queryKey: ["results"] })');
    expect(route).toContain('qc.invalidateQueries({ queryKey: ["organizer-tasks-v5"] })');
    expect(route.match(/await refreshParticipationState\(\)/g)).toHaveLength(2);
    expect(route).toContain("confirmed after reconnect");
  });

  it("preserves the reviewed operation for safe retry when reconciliation cannot prove success", () => {
    const catchStart = route.indexOf("} catch (caught) {", route.indexOf("async function confirmStatusChange"));
    const finallyStart = route.indexOf("} finally {", catchStart);
    const catchBody = route.slice(catchStart, finallyStart);

    expect(catchBody).toContain("reconcileParticipationStatusOperation(pending)");
    expect(catchBody).toContain("if (reconciled)");
    expect(catchBody).toContain("setPendingChange(null)");
    expect(catchBody).not.toContain("crypto.randomUUID()");
    expect(catchBody).not.toContain("setPendingChange(null);\n      toast.error");
  });
});
