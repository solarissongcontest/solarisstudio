import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261016040000_v3_s5_jury_consequences.sql",
);
const registry = source("src/lib/v3-domain-consequence-registry.ts");

describe("System V3 S5 Jury consequences", () => {
  it("emits completed facts from the existing idempotent operation boundary", () => {
    expect(migration).toContain("on public.studio2_operation_receipts");
    expect(migration).toContain("new.status = 'succeeded'");
    expect(migration).toContain("'jury.window.open'");
    expect(migration).toContain("'jury.window.closed'");
    expect(migration).toContain("new.command like 'jury.ballot.review.%'");
    expect(migration).toContain("'jury.dnv.set'");
    expect(migration).toContain("private.v3_emit_domain_event");
    expect(migration).not.toContain("update public.jury_voting_windows");
    expect(migration).not.toContain("update public.jury_ballot_submissions");
  });

  it("binds events to canonical edition/show and exact aggregate versions", () => {
    expect(migration).toContain("show_row.id = v_show_id");
    expect(migration).toContain("show_row.edition_id = v_edition_id");
    expect(migration).toContain("ballot.review_version = v_aggregate_version");
    expect(migration).toContain("'jury_window'");
    expect(migration).toContain("'jury_ballot'");
    expect(migration).toContain("'jury_requirement'");
  });

  it("keeps sensitive ballot rankings out of event payloads", () => {
    expect(migration).not.toContain("jury_votes vote");
    expect(migration).not.toContain("'awards'");
    expect(migration).not.toContain("'points'");
    expect(migration).toContain("'fromStatus'");
    expect(migration).toContain("'status'");
    expect(migration).toContain("'dnv'");
  });

  it("uses replay-safe leased consumers for task and notification consequences", () => {
    expect(migration).toContain("'jury.tasks'");
    expect(migration).toContain("'jury.notifications'");
    expect(migration).toContain("private.v3_domain_event_consumer_receipts");
    expect(migration).toContain("v_delivery.lease_owner is distinct from p_worker_id");
    expect(migration).toContain("private.studio2_reconcile_all_organizer_tasks");
    expect(migration).toContain("private.studio2_sync_task_notifications");
    expect(migration).toContain("private.studio2_prune_stale_task_notifications");
    expect(migration).toContain("public.solaris_enqueue_app_notifications(now())");
    expect(migration).toContain("public.studio2_complete_domain_event_delivery");
  });

  it("keeps consequence processing server-only", () => {
    expect(migration).toContain("private.studio2_request_is_service_role()");
    expect(migration).toContain(
      "revoke all on function public.studio2_process_jury_domain_event(uuid, text, text)",
    );
    expect(migration).toContain("to service_role;");
    expect(migration).not.toContain("to authenticated, service_role");
  });

  it("records concrete S5 evidence for every canonical Jury event", () => {
    expect(registry).toContain('"jury.opened": [');
    expect(registry).toContain('"jury.closed": [');
    expect(registry).toContain('"jury.ballot_changed": [');
    expect(registry).toContain(
      '"supabase/migrations/20261016040000_v3_s5_jury_consequences.sql"',
    );
  });
});
