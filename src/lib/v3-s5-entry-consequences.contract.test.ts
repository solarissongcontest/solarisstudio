import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_DOMAIN_CONSEQUENCE_REGISTRY } from "./v3-domain-consequence-registry";

const migration = readFileSync(
  "supabase/migrations/20261015190000_v3_s5_entry_consequences.sql",
  "utf8",
);
const rehearsal = readFileSync(
  ".github/scripts/v3-s5-entry-consequences-rehearsal.sh",
  "utf8",
);

describe("System V3 S5 Entry consequences", () => {
  it("emits only Entry facts with proven authoritative operation provenance", () => {
    expect(migration).toContain("v3_emit_entry_operation_events");
    expect(migration).toContain("new.command = 'confirmation.submit'");
    expect(migration).toContain("'entry.submitted'");
    expect(migration).toContain("'entry.reviewed'");
    expect(migration).toContain("'entry.changes_requested'");
    expect(migration).not.toContain("'entry.version_changed'");
    expect(migration).toContain("private.v3_entry_versions");
    expect(migration).toContain("version_row.recorded_at = new.created_at");
    expect(migration).toContain("new.result ->> 'entryVersionId'");
  });

  it("fans each supported Entry fact into the canonical task consequence", () => {
    expect(migration).toContain("array['entry.tasks']::text[]");
    expect(migration).toContain("studio2_process_entry_domain_event");
    expect(migration).toContain("private.studio2_reconcile_organizer_tasks_operational");
    expect(migration).toContain("private.studio2_sync_task_notifications");
    expect(migration).toContain("private.studio2_prune_stale_task_notifications");
    expect(migration).toContain("public.studio2_complete_domain_event_delivery");
    expect(migration).toContain("v_delivery.lease_owner is distinct from p_worker_id");
  });

  it("does not overstate unfinished Entry consequence migration", () => {
    const byType = new Map(
      V3_DOMAIN_CONSEQUENCE_REGISTRY.map((item) => [item.eventType, item]),
    );
    for (const type of [
      "entry.submitted",
      "entry.reviewed",
      "entry.changes_requested",
    ]) {
      expect(byType.get(type)?.implementationState).toBe("event-backed");
    }
    expect(byType.get("entry.version_changed")?.implementationState).toBe("declared");
  });

  it("keeps hostile verification local-only", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("entry.submitted");
    expect(rehearsal).toContain("entry.changes_requested");
    expect(rehearsal).toContain("entry.reviewed");
    expect(rehearsal).toContain("entry.tasks");
  });
});
