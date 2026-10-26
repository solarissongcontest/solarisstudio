import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  isResolvedV3DomainConsequence,
  isV3DerivedConsequenceReplacement,
  isV3ReadOnlyConsequenceReplacement,
  v3DomainConsequence,
  v3DomainConsequenceImplementationErrors,
} from "./v3-domain-consequence-registry";
import { v3ProjectionsInvalidatedByEvent } from "./v3-projection-reconciliation-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function consequence(eventType: string) {
  const row = v3DomainConsequence(eventType);
  if (!row) throw new Error(`Missing consequence ${eventType}`);
  return row;
}

describe("System V3 non-event consequence replacements", () => {
  it("treats durable receipt creation as canonical ledger state, not a phantom second event", () => {
    const row = consequence("receipt.recorded");
    expect(row.implementationState).toBe("replaced-by-read");
    expect(row.ownerDomain).toBe("receipt");
    expect(row.replacement).toMatchObject({
      kind: "canonical-read",
      operation: "public.studio2_reconcile_operation(uuid)",
      boundedBy: "one operation id per invocation",
    });
    expect(isV3ReadOnlyConsequenceReplacement(row)).toBe(true);
    expect(isResolvedV3DomainConsequence(row)).toBe(true);
    expect(v3DomainConsequenceImplementationErrors(row)).toEqual([]);
    expect(v3ProjectionsInvalidatedByEvent("receipt.recorded")).toEqual([]);

    const sql = source(
      "supabase/migrations/20261014194651_v3_s2_operation_receipt_idempotency.sql",
    );
    expect(sql).toContain("create table if not exists public.studio2_operation_receipts");
    expect(sql).toContain("create or replace function public.studio2_reconcile_operation(");
    expect(sql).toContain("stable");
    expect(sql).toContain("receipt.operation_id = p_operation_id");
    expect(sql).toContain("receipt.actor_id = v_actor");
    expect(sql).toContain("update public.studio2_operation_receipts");
    expect(sql).toContain("status = 'succeeded'");
    expect(sql).toContain("status = 'failed'");
  });

  it("replaces audit.recorded with bounded authorized reads of the append-only audit record", () => {
    const row = consequence("audit.recorded");
    expect(row.implementationState).toBe("replaced-by-read");
    expect(row.ownerDomain).toBe("audit");
    expect(row.replacement).toMatchObject({
      kind: "canonical-read",
      operation: "authorized bounded admin_audit_log reads",
      boundedBy:
        "8 edition-scoped rows for V3 recent changes; 1-100 rows for the specialist audit view",
    });
    expect(isV3ReadOnlyConsequenceReplacement(row)).toBe(true);
    expect(isResolvedV3DomainConsequence(row)).toBe(true);
    expect(v3DomainConsequenceImplementationErrors(row)).toEqual([]);
    expect(v3ProjectionsInvalidatedByEvent("audit.recorded")).toEqual([]);

    const table = source("supabase/migrations/20260914173633_canonical_admin_audit_log.sql");
    expect(table).toContain("create table if not exists public.admin_audit_log");
    expect(table).toContain("alter table public.admin_audit_log enable row level security");
    expect(table).toContain("grant select on table public.admin_audit_log to authenticated");
    expect(table).not.toContain("grant insert on table public.admin_audit_log to authenticated");

    const rls = source(
      "supabase/migrations/20260914174742_permission_engine_v2_core_rls_cutover.sql",
    );
    expect(rls).toContain('create policy "capability auditors read audit log"');
    expect(rls).toContain(
      "using (public.studio2_access_allowed('permissions.audit', null, false));",
    );

    const writer = source("src/integrations/supabase/admin-audit.server.ts");
    expect(writer).toContain('.from("admin_audit_log")');
    expect(writer).toContain(".insert(payload)");
    expect(writer).toContain("Mutation succeeded but audit logging failed");

    const projection = source("src/lib/organizer-v3-projection.server.ts");
    expect(projection).toContain('.from("admin_audit_log")');
    expect(projection).toContain('.eq("edition_id", editionId)');
    expect(projection).toContain(".limit(8)");

    const specialist = source("src/lib/admin-ops.ts");
    expect(specialist).toContain(
      "const boundedLimit = Math.min(100, Math.max(1, Math.trunc(limit)))",
    );
    expect(specialist).toContain('.limit(boundedLimit)');
  });

  it("proves task.opened/task.resolved are derived projection labels, not missing event machinery", () => {
    for (const eventType of ["task.opened", "task.resolved"]) {
      const row = consequence(eventType);
      expect(row.implementationState).toBe("replaced-by-derived-projection");
      expect(row.ownerDomain).toBe("task");
      expect(row.replacement).toMatchObject({
        kind: "canonical-derived-projection",
        operation:
          "tasksFromHodWorkspace(snapshot) + private.studio2_reconcile_all_organizer_tasks(uuid)",
        boundedBy:
          "one participant edition+country workspace snapshot and one Organizer edition per reconciliation invocation",
      });
      expect(isV3DerivedConsequenceReplacement(row)).toBe(true);
      expect(isResolvedV3DomainConsequence(row)).toBe(true);
      expect(v3DomainConsequenceImplementationErrors(row)).toEqual([]);
      expect(v3ProjectionsInvalidatedByEvent(eventType)).toEqual([]);
    }

    const authority = source("src/lib/solaris-v6-runtime-authority.ts");
    expect(authority).toContain('task: {');
    expect(authority).toContain('kind: "canonical-read" as const');
    expect(authority).toContain("read: loadOrganizerTasksV5");
    expect(authority).toContain('transports: ["admin_organizer_tasks"] as const');

    const participant = source("src/lib/participation-os.ts");
    expect(participant).toContain("export function tasksFromHodWorkspace(");
    expect(participant).toContain("Eligibility, workflow, deadlines,");
    expect(participant).toContain(
      "notices and submission truth remain owned by the existing RPC snapshot.",
    );

    const participantSurface = source(
      "src/components/mysolaris/modules/MySolarisTasksModule.tsx",
    );
    expect(participantSurface).toContain("loadStudio2HodWorkspace");
    expect(participantSurface).toContain("tasksFromHodWorkspace(snapshot)");

    const taskEngine = source(
      "supabase/migrations/20261002211500_organisation_os_v5_task_engine.sql",
    );
    expect(taskEngine).toContain("source_key text not null unique");
    expect(taskEngine).toContain("on conflict (source_key) do update");
    expect(taskEngine).toContain("state = 'resolved'");

    const reconcile = source(
      "supabase/migrations/20261003154000_organisation_os_v5_r3_permission_tasks.sql",
    );
    expect(reconcile).toContain(
      "create or replace function private.studio2_reconcile_all_organizer_tasks(",
    );
    expect(reconcile).toContain(
      "perform private.studio2_reconcile_all_organizer_tasks(p_edition_id);",
    );
    expect(reconcile).toContain(
      "and public.studio2_access_allowed(task.required_capability, task.edition_id, false)",
    );

    const completeReconcile = source(
      "supabase/migrations/20261004230000_organizer_task_runtime_reconciliation.sql",
    );
    expect(completeReconcile).toContain(
      "create or replace function private.studio2_reconcile_all_organizer_tasks(",
    );
    expect(completeReconcile).toContain(
      "perform private.studio2_reconcile_system_job_tasks();",
    );
    expect(completeReconcile).toContain(
      "select private.studio2_reconcile_all_organizer_tasks(null);",
    );

    const serviceBoundary = source(
      "supabase/migrations/20261021161000_v3_s14_task_reconciliation_service_boundary.sql",
    );
    expect(serviceBoundary).toContain(
      "revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)",
    );
    expect(serviceBoundary).toContain("from public, anon, authenticated;");
    expect(serviceBoundary).toContain(
      "grant execute on function private.studio2_reconcile_all_organizer_tasks(uuid)",
    );
    expect(serviceBoundary).toContain("to service_role;");

    const taskClient = source("src/lib/admin-tasks-v5.ts");
    expect(taskClient).toContain("const exactEditionId = requireOrganizerEditionId(editionId)");
    expect(taskClient).toContain('client.rpc("admin_organizer_tasks"');
    expect(taskClient).toContain("task.editionId !== exactEditionId");
  });

  it("does not let a replacement retain fabricated event side effects", () => {
    for (const eventType of [
      "receipt.recorded",
      "audit.recorded",
      "task.opened",
      "task.resolved",
    ]) {
      const row = consequence(eventType);
      expect(row.taskEffects).toEqual([]);
      expect(row.notificationEffects).toEqual([]);
      expect(row.publicationEffects).toEqual([]);
      expect(row.realtimeEffects).toEqual([]);
      expect(row.analyticsEffects).toEqual([]);
      expect(row.auditRequired).toBe(false);

      expect(
        isResolvedV3DomainConsequence({
          ...row,
          analyticsEffects: [`forged:${eventType}`],
        }),
      ).toBe(false);
    }
  });
});
