import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { v3DomainConsequence } from "./v3-domain-consequence-registry";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source("supabase/migrations/20261016062000_v3_s5_notice_consequences.sql");
const rehearsal = source(".github/scripts/v3-s5-notice-consequences-rehearsal.sh");

describe("System V3 S5 Notice consequences", () => {
  it("materializes recipients from authoritative identity sources and the strict audience predicate", () => {
    expect(migration).toContain("from public.country_accounts account");
    expect(migration).toContain("from public.studio2_role_assignments assignment");
    expect(migration).toContain("from public.studio2_capability_grants grant_row");
    expect(migration).toContain("private.studio2_user_can_receive_notice_as_recipient(");
    expect(migration).toContain("insert into public.studio2_notice_receipts");
    expect(migration).toContain("delivered_at = coalesce(");
  });

  it("emits only committed publish/supersede lifecycle transitions", () => {
    expect(migration).toContain("new.status not in ('published', 'superseded')");
    expect(migration).toContain("old.status is not distinct from new.status");
    expect(migration).toContain("'notice.published'");
    expect(migration).toContain("'notice.superseded'");
    expect(migration).toContain("new.revision::bigint");
  });

  it("creates deterministic operation receipts without putting notice content in the event", () => {
    expect(migration).toContain("private.v3_notice_transition_operation_id");
    expect(migration).toContain("private.studio2_request_fingerprint(");
    expect(migration).toContain("'notice.publish'");
    expect(migration).toContain("'notice.supersede'");
    expect(migration).toContain("'R2'");
    expect(migration).not.toContain("'title', new.title");
    expect(migration).not.toContain("'body', new.body");
  });

  it("correlates supersession to the replacement publication when available", () => {
    expect(migration).toContain("event_row.event_type = 'notice.published'");
    expect(migration).toContain("event_row.aggregate_id = new.superseded_by_id::text");
    expect(migration).toContain("v_correlation_id := v_parent_event.correlation_id");
  });

  it("uses the shared leased consumer contract for official notification evaluation", () => {
    expect(migration).toContain("array['notice.notifications']::text[]");
    expect(migration).toContain("private.v3_domain_event_consumer_receipts");
    expect(migration).toContain("v_delivery.lease_owner is distinct from p_worker_id");
    expect(migration).toContain("public.solaris_enqueue_app_notifications(now())");
    expect(migration).toContain("private.studio2_request_is_service_role()");
  });

  it("keeps delivery-failure task ownership in the Notification domain", () => {
    expect(v3DomainConsequence("notice.published")?.taskEffects).toEqual([]);
    expect(v3DomainConsequence("notice.superseded")?.taskEffects).toEqual([]);
    expect(v3DomainConsequence("notification.failed")?.taskEffects).toEqual([
      { effect: "re-evaluate", taskType: "notification.delivery_failed" },
    ]);
  });

  it("backfills only recipient projection state instead of manufacturing historical events", () => {
    const backfill = migration.slice(migration.indexOf("do $backfill$"));
    expect(backfill).toContain("private.v3_materialize_notice_recipients");
    expect(backfill).not.toContain("private.v3_emit_domain_event");
  });

  it("rehearses audience isolation, provider delivery, supersession and replay locally", () => {
    expect(rehearsal).toContain("Eligible recipient receipt was not materialized");
    expect(rehearsal).toContain("Ineligible user received a notice receipt");
    expect(rehearsal).toContain("Notice title leaked into DomainEvent payload");
    expect(rehearsal).toContain("Official notification delivery candidate missing");
    expect(rehearsal).toContain("Notice consequence replay was not idempotent");
    expect(rehearsal).toContain("Superseded notice did not inherit replacement correlation");
    expect(rehearsal).toContain("Unrelated notice edit emitted a lifecycle event");
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
  });
});
