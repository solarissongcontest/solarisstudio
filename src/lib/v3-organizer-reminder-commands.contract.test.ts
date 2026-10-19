import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { v3DomainConsequence } from "./v3-domain-consequence-registry";
import { v3SystemDomain } from "./v3-system-domain-registry";

const migration = readFileSync(
  "supabase/migrations/20261020002000_v3_organizer_reminder_commands.sql",
  "utf8",
);
const client = readFileSync("src/lib/admin-ops.ts", "utf8");

describe("V3 Organizer custom reminder command authority", () => {
  it("registers one canonical reminder owner and event-backed consequence", () => {
    const domain = v3SystemDomain("organizer-reminder");
    expect(domain?.primaryTables).toEqual(["admin_deadlines"]);
    expect(domain?.mutationCommands).toEqual([
      "organizer_reminder.create",
      "organizer_reminder.set_completed",
    ]);
    expect(domain?.eventTypes).toEqual(["organizer_reminder.changed"]);

    const consequence = v3DomainConsequence("organizer_reminder.changed");
    expect(consequence?.ownerDomain).toBe("organizer-reminder");
    expect(consequence?.implementationState).toBe("event-backed");
    expect(consequence?.auditRequired).toBe(true);
  });

  it("versions reminders and rejects stale completion commands server-side", () => {
    expect(migration).toContain("add column if not exists revision bigint not null default 1");
    expect(migration).toContain("p_expected_revision bigint");
    expect(migration).toContain("for update");
    expect(migration).toContain("v_deadline.revision is distinct from p_expected_revision");
    expect(migration).toContain("and revision = p_expected_revision");
    expect(migration).toContain("using errcode = '40001'");
  });

  it("binds authorization to the exact edition and optional show scope", () => {
    expect(migration).toContain("private.studio2_admin_deadline_scope_allowed");
    expect(migration).toContain("v_show_edition_id is distinct from p_edition_id");
    expect(migration).toContain("studio2_access_allowed('edition.manage', p_edition_id, false)");
    expect(migration).toContain("Missing Solaris capability: edition.manage");
  });

  it("routes create and complete/reopen through the canonical operation ledger", () => {
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("'organizer_reminder.create'");
    expect(migration).toContain("'organizer_reminder.set_completed'");
    expect(migration).toContain("private.studio2_complete_operation");
    expect(migration).toContain("public.studio2_reconcile_operation(p_operation_id)");
    expect(migration).toContain("'v3.organizer-reminder-commands'");
  });

  it("writes audit and a completed-fact DomainEvent in the same command transaction", () => {
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'organizer_reminder.changed'");
    expect(migration).toContain("'organizer_reminder'");
    expect(migration).toContain("array[]::text[]");
  });

  it("removes direct authenticated reminder writes after command cutover", () => {
    expect(migration).toContain(
      "revoke insert, update, delete on public.admin_deadlines from authenticated",
    );
    expect(client).toContain('rpc("studio2_create_admin_deadline"');
    expect(client).toContain('rpc("studio2_admin_deadline_preview"');
    expect(client).toContain('rpc("studio2_set_admin_deadline_completed"');
    expect(client).not.toContain('.from("admin_deadlines")\n        .insert(');
    expect(client).not.toContain('.from("admin_deadlines")\n        .update(');
  });

  it("preserves the same operation identity across uncertain user retries", () => {
    expect(client).toContain("PendingReminderOperation");
    expect(client).toContain("pendingRef.current?.fingerprint === fingerprint");
    expect(client).toContain("resolveSolarisV6OperationRecovery");
    expect(client).toContain("studio2_reconcile_operation");
    expect(client).toContain("if (!recovery.keepOperationOpen) pendingRef.current = null");
  });
});
