import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261020000010_v3_system_reminder_authority.sql"),
  "utf8",
);
const client = readFileSync(resolve(process.cwd(), "src/lib/admin-ops.ts"), "utf8");

describe("V3 Organizer reminder authority", () => {
  it("keeps one canonical reminder store and registers the migration contract", () => {
    expect(migration).toContain("alter table public.admin_deadlines");
    expect(migration).not.toContain("create table public.v3_admin_deadlines");
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.system.organizer-reminder-authority'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("adds optimistic versioning and exact-edition/show scope validation", () => {
    expect(migration).toContain("add column if not exists version bigint not null default 1");
    expect(migration).toContain("private.v3_touch_admin_deadline_version");
    expect(migration).toContain("p_expected_version");
    expect(migration).toContain("VERSION_CONFLICT");
    expect(migration).toContain("show_row.edition_id");
    expect(migration).toContain("public.studio2_access_allowed('edition.manage', p_edition_id, false)");
  });

  it("uses the S2 idempotent operation ledger for every consequential reminder mutation", () => {
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("coalesce(p_correlation_id, p_operation_id)");
    expect(migration).toContain("'organizer.reminder.' || v_action");
    expect(migration).toContain("'R2'");
    expect(migration).toContain("private.studio2_complete_operation");
  });

  it("supports the complete lifecycle without destructive reminder deletion", () => {
    expect(migration).toContain("('create', 'update', 'complete', 'reopen', 'archive')");
    expect(migration).toContain("set archived_at = now()");
    expect(migration).not.toContain("delete from public.admin_deadlines");
  });

  it("records audit and transactional completed facts before success can escape", () => {
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("private.v3_emit_admin_deadline_operation_event");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("after update of status, result");
    expect(migration).toContain("new.command not like 'organizer.reminder.%'");
  });

  it("closes browser DML after installing the command RPC", () => {
    expect(migration).toContain(
      "revoke insert, update, delete on public.admin_deadlines from authenticated",
    );
    expect(migration).toContain("grant select on public.admin_deadlines to authenticated");
    expect(migration).toContain("grant execute on function public.studio2_apply_admin_deadline");
  });

  it("cuts Organizer create/toggle hooks over to preview/apply/reconcile instead of raw table writes", () => {
    expect(client).toContain('adminDb.rpc("studio2_apply_admin_deadline"');
    expect(client).toContain('"studio2_admin_deadline_preview"');
    expect(client).toContain('adminDb.rpc("studio2_reconcile_operation"');
    expect(client).not.toContain('.from("admin_deadlines")\n        .insert(');
    expect(client).not.toContain('.from("admin_deadlines")\n        .update({ completed_at');
  });

  it("hides archived reminders and invalidates canonical Organizer reads after mutations", () => {
    expect(client).toContain('.is("archived_at", null)');
    expect(client).toContain('queryKey: ["organizer-v3-projection"]');
    expect(client).toContain('queryKey: ["admin-audit"]');
  });
});
