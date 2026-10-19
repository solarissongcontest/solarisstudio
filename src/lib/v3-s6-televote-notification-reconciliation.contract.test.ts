import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_NOTIFICATION_PROVIDER_REGISTRY } from "./v3-notification-provider-registry";
import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019114000_v3_s6_televote_notification_reconciliation.sql",
  ),
  "utf8",
);
const rehearsal = readFileSync(
  resolve(
    process.cwd(),
    ".github/scripts/v3-s6-televote-notification-reconciliation-rehearsal.sh",
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

describe("System V3 S6 televote-open notification reconciliation", () => {
  it("registers as a forward-only post-S13 migration", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.s6.notification-reconciliation-televote-open'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("set_config('request.jwt.claim.role', 'service_role', true)");
    expect(migration).toContain("set_config('request.jwt.claim.role', '', true)");
  });

  it("derives repair candidates from canonical open-round plus recipient preference truth", () => {
    const expected = functionBody(
      "private.v3_expected_televote_open_notification_candidates",
    );
    expect(expected).toContain("from televoting.rounds round");
    expect(expected).toContain("round.status = 'open'");
    expect(expected).toContain("from public.notification_preferences preference");
    expect(expected).toContain("preference.profile_id = p_user_id");
    expect(expected).toContain("preference.external_enabled = true");
    expect(expected).toContain("'televoting' = any(preference.categories)");
    expect(expected).toContain(
      "'televote:' || round.id::text || ':' || p_user_id::text || ':opened'",
    );
  });

  it("extends only the explicit provider dispatch instead of enabling arbitrary categories", () => {
    const dispatch = functionBody(
      "private.v3_expected_notification_provider_candidates",
    );
    expect(dispatch).toContain("p_provider_id = 'organizer-task-activation'");
    expect(dispatch).toContain("p_provider_id = 'televote-open'");
    expect(dispatch).toContain("Unsupported notification reconciliation provider");
    expect(dispatch).not.toContain("solaris_enqueue_app_notifications");
  });

  it("keeps televote verification independent from repair candidate helpers", () => {
    const verifier = functionBody("private.v3_verify_notification_provider");
    const televoteSection = verifier.slice(verifier.indexOf("elsif p_provider_id = 'televote-open'"));
    expect(televoteSection).toContain("from televoting.rounds round");
    expect(televoteSection).toContain("from public.notification_preferences preference");
    expect(televoteSection).toContain("from public.notification_deliveries delivery");
    expect(televoteSection).not.toContain(
      "v3_expected_televote_open_notification_candidates",
    );
    expect(televoteSection).not.toContain(
      "v3_expected_notification_provider_candidates",
    );
    expect(verifier).not.toContain("insert into");
    expect(verifier).not.toContain("update public.");
    expect(verifier).not.toContain("delete from");
  });

  it("keeps the existing hard actor/provider cardinality bounds", () => {
    expect(migration).toContain("v_expected_count > 100");
    expect(migration).toContain("v_delivery_count > 250");
    expect(migration).toContain("'repair_bound_exceeded'");
    expect(migration).toContain("'verification_bound_exceeded'");
    const repair = functionBody("private.v3_reconcile_notification_provider");
    expect(repair).toContain("delivery.user_id = p_user_id");
    expect(repair).toContain("delivery.category = v_category");
  });

  it("preserves immutable sent history and stable dedupe identity", () => {
    const repair = functionBody("private.v3_reconcile_notification_provider");
    expect(repair).toContain("delivery.status in ('pending', 'processing', 'failed')");
    expect(repair).toContain("delivery.status = 'suppressed'");
    expect(repair).toContain("delivery.status = 'pending'");
    expect(repair).toContain("on conflict (user_id, dedupe_key) do nothing");
    expect(repair).not.toContain("delivery.status = 'sent'");
    expect(repair).not.toContain("delete from public.notification_deliveries");
  });

  it("still refuses to overclaim whole notification-domain rebuildability", () => {
    const providers = V3_NOTIFICATION_PROVIDER_REGISTRY.map((provider) => provider.id);
    expect(providers).toContain("organizer-task-activation");
    expect(providers).toContain("televote-open");
    expect(providers.length).toBeGreaterThan(2);

    const notifications = V3_PROJECTION_RECONCILIATION_REGISTRY.filter(
      (projection) => projection.canonicalDomains.includes("notification"),
    );
    expect(notifications.length).toBeGreaterThan(0);
    expect(
      notifications.every((projection) => projection.repair.state === "foundation"),
    ).toBe(true);
  });

  it("rehearses preference, round-close suppression and same-identity reactivation locally", () => {
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(rehearsal).toContain("Refusing non-local database rehearsal");
    expect(rehearsal).toContain("'missing' == 1");
    expect(rehearsal).toContain("'inserted' == 1");
    expect(rehearsal).toContain("'staleActive' == 1");
    expect(rehearsal).toContain("'suppressed' == 1");
    expect(rehearsal).toContain("'suppressedExpected' == 1");
    expect(rehearsal).toContain("'reactivated' == 1");
  });
});
