import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261018081500_v3_s5_entry_lifecycle_consequences.sql",
);
const rehearsal = source(
  ".github/scripts/v3-s5-entry-lifecycle-consequences-rehearsal.sh",
);

describe("System V3 S5 Entry lifecycle consequences", () => {
  it("derives version facts from the immutable Entry version authority", () => {
    expect(migration).toContain("after insert on private.v3_entry_versions");
    expect(migration).toContain("'entry.version_changed'");
    expect(migration).toContain("'entry.restore_version'");
    expect(migration).toContain("'entry.submit'");
    expect(migration).toContain("new.source = 'legacy_observation'");
    expect(migration).toContain("if new.actor_id is null then");
    expect(migration).toContain("private.studio2_request_fingerprint(");
    expect(migration).toContain("public.studio2_operation_receipts");
    expect(migration).toContain("array['entry.tasks']::text[]");
  });

  it("does not turn every Confirmation response into a fictional Entry submission", () => {
    expect(migration).toContain("new.command <> 'confirmation.submit'");
    expect(migration).toContain("if not v_submission.participating then");
    expect(migration).toContain("v_entry_count");
    expect(migration).toContain("if coalesce(v_entry_count, 0) = 0 then");
    expect(migration).toContain("'entry.submitted'");
    expect(migration).toContain("'entry_submission'");
    expect(migration).toContain("v_submission.edit_count is distinct from v_edit_count");
  });

  it("keeps one Entry consequence processor for all lifecycle facts", () => {
    expect(migration).toContain("studio2_process_entry_domain_event");
    for (const eventType of [
      "entry.submitted",
      "entry.version_changed",
      "entry.reviewed",
      "entry.changes_requested",
    ]) {
      expect(migration).toContain(`'${eventType}'`);
    }
    expect(migration).toContain("private.studio2_reconcile_all_organizer_tasks");
    expect(migration).toContain("private.v3_domain_event_consumer_receipts");
    expect(migration).toContain("public.studio2_complete_domain_event_delivery");
  });

  it("marks the complete declared Entry lifecycle event-backed", () => {
    for (const eventType of [
      "entry.submitted",
      "entry.version_changed",
      "entry.reviewed",
      "entry.changes_requested",
    ]) {
      expect(v3DomainConsequence(eventType)?.implementationState).toBe("event-backed");
      expect(v3DomainConsequence(eventType)?.ownerDomain).toBe("entry");
    }
  });

  it("keeps hostile lifecycle proof local-only", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("entry.version_changed");
    expect(rehearsal).toContain("entry.submitted");
    expect(rehearsal).toContain("non-participating Confirmation fabricated entry.submitted");
    expect(rehearsal).toContain("ownerless fixture fabricated entry.version_changed");
    expect(rehearsal).toContain("entry-task-reconciliation");
  });
});
