import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { V3_DOMAIN_CONSEQUENCE_REGISTRY } from "./v3-domain-consequence-registry";

const migration = readFileSync(
  "supabase/migrations/20261015201221_v3_s5_entry_consequences.sql",
  "utf8",
);
const rehearsal = readFileSync(
  ".github/scripts/v3-s5-entry-consequences-rehearsal.sh",
  "utf8",
);

describe("System V3 S5 Entry consequences", () => {
  it("emits only after the canonical S2 Entry receipt succeeds", () => {
    expect(migration).toContain("v3_emit_entry_operation_event");
    expect(migration).toContain("after update of status on public.studio2_operation_receipts");
    expect(migration).toContain("old.status is distinct from new.status");
    expect(migration).toContain("new.status = 'succeeded'");
    expect(migration).toContain("'entry.request_changes'");
    expect(migration).toContain("'entry.accept'");
    expect(migration).toContain("'entry.remove'");
    expect(migration).toContain("'entry.reset_review'");
  });

  it("binds each fact to canonical Entry revision and edition provenance", () => {
    expect(migration).toContain("submission.edition_id = v_edition_id");
    expect(migration).toContain("entry.current_version_id = v_entry_version_id");
    expect(migration).toContain("'entry.changes_requested'");
    expect(migration).toContain("'entry.reviewed'");
    expect(migration).toContain("'entry_review'");
    expect(migration).toContain("array['entry.tasks']::text[]");
    expect(migration).toContain("private.v3_emit_domain_event");
  });

  it("executes task reconciliation once under the S4 lease", () => {
    expect(migration).toContain("studio2_process_entry_domain_event");
    expect(migration).toContain("private.studio2_reconcile_all_organizer_tasks");
    expect(migration).toContain("private.v3_domain_event_consumer_receipts");
    expect(migration).toContain("v_delivery.lease_owner is distinct from p_worker_id");
    expect(migration).toContain("v_delivery.lease_expires_at <= now()");
    expect(migration).toContain("public.studio2_complete_domain_event_delivery");
  });

  it("marks only the migrated Entry review facts as event-backed", () => {
    const eventBacked = V3_DOMAIN_CONSEQUENCE_REGISTRY
      .filter(
        (consequence) =>
          consequence.ownerDomain === "entry" &&
          consequence.implementationState === "event-backed",
      )
      .map((consequence) => consequence.eventType)
      .sort();

    expect(eventBacked).toEqual([
      "entry.changes_requested",
      "entry.reviewed",
    ]);
  });

  it("keeps the hostile proof local-only and replay-aware", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("entry.changes_requested");
    expect(rehearsal).toContain("entry.reviewed");
    expect(rehearsal).toContain("replayed");
  });
});
