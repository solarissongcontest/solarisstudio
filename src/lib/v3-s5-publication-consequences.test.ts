import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source("supabase/migrations/20261016060000_v3_s5_publication_consequences.sql");
const rehearsal = source(".github/scripts/v3-s5-publication-consequences-rehearsal.sh");
const registry = source("src/lib/v3-domain-consequence-registry.ts");

describe("System V3 S5 Publication consequences", () => {
  it("bridges committed publication operation receipts instead of UI intent", () => {
    expect(migration).toContain("new.command <> 'publication.show.change'");
    expect(migration).toContain("new.status <> 'succeeded'");
    expect(migration).toContain("control.version = v_version");
    expect(migration).toContain("control.state = v_state");
    expect(migration).toContain("'publication.changed'");
  });

  it("bridges scheduled success and failure from durable execution rows", () => {
    expect(migration).toContain("on public.studio2_show_publication_executions");
    expect(migration).toContain("new.status = 'succeeded'");
    expect(migration).toContain("'publication.changed'");
    expect(migration).toContain("new.status = 'blocked'");
    expect(migration).toContain("'publication.failed'");
    expect(migration).toContain("'PUBLICATION_REVALIDATION_BLOCKED'");
  });

  it("installs only the final scheduler identity semantics in one migration", () => {
    expect(migration).toContain("operation_id,\n    actor_id");
    expect(migration).toContain("new.id,\n    v_actor_id");
    expect(migration).toContain("v_correlation_id := v_parent.correlation_id");
    expect(migration).toContain("'publication.show.execute'");
    expect(migration).toContain("where receipt.operation_id = new.id");
    expect(migration).toContain("new.id,\n    new.edition_id,\n    new.show_id");
    expect(migration).not.toContain("v_operation_id := coalesce(new.scheduled_operation_id, new.id)");
  });

  it("rejects missing or contradictory scheduling provenance", () => {
    expect(migration).toContain("v_parent.command is distinct from 'publication.show.change'");
    expect(migration).toContain("v_parent.status <> 'succeeded'");
    expect(migration).toContain("Scheduled publication execution lacks valid scheduling provenance");
    expect(migration).toContain("v_control.edition_id is distinct from new.edition_id");
  });

  it("uses replay-safe leased consumers for task and notification consequences", () => {
    expect(migration).toContain("'publication.tasks'");
    expect(migration).toContain("'publication.notifications'");
    expect(migration).toContain("private.v3_domain_event_consumer_receipts");
    expect(migration).toContain("v_delivery.lease_owner is distinct from p_worker_id");
    expect(migration).toContain("private.studio2_reconcile_all_organizer_tasks");
    expect(migration).toContain("public.solaris_enqueue_app_notifications(now())");
    expect(migration).toContain("private.studio2_request_is_service_role()");
  });

  it("rehearses distinct execution identity, failure and replay on local Supabase", () => {
    expect(rehearsal).toContain("distinct execution operation inside the scheduling correlation chain");
    expect(rehearsal).toContain("Scheduled execution incorrectly reused the scheduling operation identity");
    expect(rehearsal).toContain("publication.failed event missing");
    expect(rehearsal).toContain("Publication consequence replay was not idempotent");
    expect(rehearsal).toContain("anonymous Publication consequence processing unexpectedly succeeded");
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
  });

  it("records both canonical Publication events as event-backed from the final migration", () => {
    expect(registry).toContain('"publication.changed": [');
    expect(registry).toContain('"publication.failed": [');
    expect(registry).toContain(
      '"supabase/migrations/20261016060000_v3_s5_publication_consequences.sql"',
    );
    expect(registry).not.toContain("20261016061000_v3_s5_publication_execution_identity.sql");
  });
});
