import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261019211200_v3_show_lifecycle_events.sql",
  "utf8",
);

describe("V3 Show lifecycle DomainEvent bridge", () => {
  it("registers the forward-only migration under S13", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'20261019211200_v3_show_lifecycle_events'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("emits only from successful governed Show operation receipts", () => {
    expect(migration).toContain("new.command not in ('show.create', 'show.update', 'show.mode.update', 'show.delete')");
    expect(migration).toContain("new.status <> 'succeeded'");
    expect(migration).toContain("after update of status on public.studio2_operation_receipts");
  });

  it("uses the current S4 event signature and receipt-derived operation provenance", () => {
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'show.changed'");
    expect(migration).toContain("new.operation_id,\n    v_edition_id,\n    null,\n    jsonb_build_object(");
    expect(migration).toContain("array[]::text[]");
  });

  it("keeps lifecycle events from becoming an accidental FK deletion blocker", () => {
    expect(migration).toContain("v_show_id::text");
    expect(migration).toContain("new.operation_id,\n    v_edition_id,\n    null,");
    expect(migration).not.toContain("new.operation_id,\n    v_edition_id,\n    v_show_id,");
  });

  it("represents a delete tombstone as the next aggregate version", () => {
    expect(migration).toContain("v_event_version := v_state_version + case when v_deleted then 1 else 0 end");
    expect(migration).toContain("'eventVersion', v_event_version");
    expect(migration).toContain("'deleted', v_deleted");
  });

  it("does not expose the private trigger function to browser or service roles", () => {
    expect(migration).toContain(
      "revoke all on function private.studio2_emit_show_lifecycle_operation_event()",
    );
    expect(migration).toContain("from public, anon, authenticated, service_role");
  });
});
