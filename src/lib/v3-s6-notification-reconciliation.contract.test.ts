import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_NOTIFICATION_PROVIDER_REGISTRY } from "./v3-notification-provider-registry";
import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019113000_v3_s6_notification_reconciliation.sql",
  ),
  "utf8",
);
const rehearsal = readFileSync(
  resolve(
    process.cwd(),
    ".github/scripts/v3-s6-notification-reconciliation-rehearsal.sh",
  ),
  "utf8",
);

function functionBody(name: string) {
  const marker = `create or replace function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("\ncreate or replace function ", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("System V3 S6 notification reconciliation foundation", () => {
  it("registers as a post-S13 forward-only migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.s6.notification-reconciliation-organizer-task'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("set_config('request.jwt.claim.role', 'service_role', true)");
    expect(migration).toContain("set_config('request.jwt.claim.role', '', true)");
  });

  it("is genuinely actor/provider bounded and refuses unsupported providers", () => {
    expect(migration).toContain("p_user_id uuid");
    expect(migration).toContain("p_provider_id text");
    expect(migration).toContain("p_provider_id is distinct from 'organizer-task-activation'");
    expect(migration).toContain("v_expected_count > 100");
    expect(migration).toContain("v_delivery_count > 250");
    expect(migration).toContain("'repair_bound_exceeded'");
    expect(migration).toContain("'verification_bound_exceeded'");
    expect(migration).not.toContain("solaris_enqueue_app_notifications(");
  });

  it("rebuilds Organizer Task candidates from canonical Task truth and stable dedupe identity", () => {
    const expected = functionBody(
      "private.v3_expected_organizer_task_notification_candidates",
    );
    expect(expected).toContain("from public.studio2_organizer_tasks task");
    expect(expected).toContain("task.state <> 'resolved'");
    expect(expected).toContain("task.priority in ('critical', 'high')");
    expect(expected).toContain("private.studio2_task_recipient_eligible(task.id, p_user_id)");
    expect(expected).toContain(
      "'organizer-task:' || task.source_key || ':' || p_user_id::text",
    );
    expect(expected).toContain("task.href like '/%'");
  });

  it("keeps verification independent from the repair candidate helper", () => {
    const verifier = functionBody("private.v3_verify_notification_provider");
    expect(verifier).toContain("from public.studio2_organizer_tasks task");
    expect(verifier).toContain("from public.notification_deliveries delivery");
    expect(verifier).toContain("private.studio2_task_recipient_eligible(task.id, p_user_id)");
    expect(verifier).not.toContain(
      "v3_expected_organizer_task_notification_candidates",
    );
    expect(verifier).not.toContain("insert into");
    expect(verifier).not.toContain("update public.");
    expect(verifier).not.toContain("delete from");
  });

  it("repairs only unsent projection state and preserves sent delivery history", () => {
    const repair = functionBody("private.v3_reconcile_notification_provider");
    expect(repair).toContain("delivery.status in ('pending', 'processing', 'failed')");
    expect(repair).toContain("delivery.status = 'suppressed'");
    expect(repair).toContain("delivery.status = 'pending'");
    expect(repair).toContain("on conflict (user_id, dedupe_key) do nothing");
    expect(repair).not.toContain("delivery.status = 'sent'");
    expect(repair).not.toContain("delete from public.notification_deliveries");
  });

  it("keeps the service mutation and verifier unavailable to browser roles", () => {
    expect(migration).toContain(
      "revoke all on function public.studio2_reconcile_notification_provider(uuid, text, timestamptz)\n  from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_reconcile_notification_provider(uuid, text, timestamptz)\n  to service_role;",
    );
    expect(migration).toContain(
      "revoke all on function public.studio2_verify_notification_provider(uuid, text)\n  from public, anon, authenticated;",
    );
    expect(migration).toContain("if not private.studio2_request_is_service_role() then");
  });

  it("does not overclaim whole notification rebuildability while providers remain uncovered", () => {
    const providerIds = V3_NOTIFICATION_PROVIDER_REGISTRY.map((provider) => provider.id);
    expect(providerIds).toContain("organizer-task-activation");
    expect(providerIds.length).toBeGreaterThan(1);

    const notificationProjections = V3_PROJECTION_RECONCILIATION_REGISTRY.filter(
      (projection) => projection.canonicalDomains.includes("notification"),
    );
    expect(notificationProjections.length).toBeGreaterThan(0);
    expect(
      notificationProjections.every(
        (projection) => projection.repair.state === "foundation",
      ),
    ).toBe(true);
  });

  it("keeps executable verification local-only and covers missing, stale and reactivated states", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("ordinary authenticated repair");
    expect(rehearsal).toContain("'state' == 'drift'");
    expect(rehearsal).toContain("'inserted' == 1");
    expect(rehearsal).toContain("'suppressed' == 1");
    expect(rehearsal).toContain("'reactivated' == 1");
  });
});
