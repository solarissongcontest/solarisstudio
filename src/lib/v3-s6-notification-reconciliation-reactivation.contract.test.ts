import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019113100_v3_s6_notification_reactivation.sql",
  ),
  "utf8",
);

function functionBody(name: string) {
  const marker = `function ${name}`;
  const start = migration.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = migration.indexOf("as $", start);
  expect(bodyStart).toBeGreaterThan(start);
  const delimiterStart = bodyStart + 4;
  const delimiterEnd = migration.indexOf("$", delimiterStart);
  const delimiter = migration.slice(bodyStart + 3, delimiterEnd + 1);
  const bodyEnd = migration.indexOf(delimiter, delimiterEnd + 1);
  expect(bodyEnd).toBeGreaterThan(delimiterEnd);
  return migration.slice(start, bodyEnd + delimiter.length);
}

describe("System V3 S6 notification reconciliation reactivation", () => {
  it("reactivates only canonically suppressed, never-sent identities", () => {
    const reactivate = functionBody(
      "private.solaris_reactivate_expected_notification_deliveries",
    );

    expect(reactivate).toContain("delivery.status = 'suppressed'");
    expect(reactivate).toContain("delivery.sent_at is null");
    expect(reactivate).toContain(
      "'Canonical task or window state no longer requires delivery.'",
    );
    expect(reactivate).toContain(
      "'Task completed or window closed before delivery.'",
    );
    expect(reactivate).toContain("status = 'pending'");
    expect(reactivate).toContain("processing_started_at = null");
    expect(reactivate).toContain("error = null");
    expect(reactivate).not.toContain("delivery.status = 'failed'");
    expect(reactivate).not.toContain("delivery.status = 'sent'");
  });

  it("refreshes presentation fields from canonical provider truth without changing the stable identity", () => {
    const reactivate = functionBody(
      "private.solaris_reactivate_expected_notification_deliveries",
    );

    expect(reactivate).toContain(
      "private.solaris_expected_notification_deliveries(p_user_id, p_now)",
    );
    expect(reactivate).toContain("delivery.user_id = candidate.user_id");
    expect(reactivate).toContain("delivery.dedupe_key = candidate.dedupe_key");
    expect(reactivate).toContain("category = candidate.category");
    expect(reactivate).toContain("event_type = candidate.event_type");
    expect(reactivate).toContain("route = candidate.route");
    expect(reactivate).toContain("title = candidate.title");
    expect(reactivate).toContain("body = candidate.body");
    expect(reactivate).toContain("scheduled_for = candidate.scheduled_for");
    expect(reactivate).not.toMatch(/dedupe_key\s*=\s*candidate\.dedupe_key/);
  });

  it("treats persisted preference opt-out as stale for user-configurable categories only", () => {
    const stale = functionBody("private.solaris_stale_notification_delivery_ids");

    for (const category of [
      "confirmations",
      "deadlines",
      "jury",
      "televoting",
      "official",
      "predictions",
      "following",
      "results",
    ]) {
      expect(stale).toContain(`'${category}'`);
    }
    expect(stale).toContain("preference.external_enabled = true");
    expect(stale).toContain("delivery.category = any(preference.categories)");
    expect(stale).not.toContain("'organizer_tasks',");
  });

  it("makes expected-but-suppressed state explicit verification drift", () => {
    const verify = functionBody(
      "public.studio2_verify_notification_delivery_projection",
    );

    expect(verify).toContain("v_suppressed_expected integer := 0");
    expect(verify).toContain("delivery.status = 'suppressed'");
    expect(verify).toContain("'suppressedExpected', v_suppressed_expected");
    expect(verify).toContain(
      "v_missing = 0 and v_stale = 0 and v_suppressed_expected = 0",
    );
    expect(verify).not.toMatch(/\binsert\s+into\b/i);
    expect(verify).not.toMatch(/\bupdate\s+public\./i);
  });

  it("reactivates before inserting missing identities in scoped repair", () => {
    const repair = functionBody(
      "public.studio2_reconcile_notification_delivery_projection",
    );
    const reactivateIndex = repair.indexOf(
      "private.solaris_reactivate_expected_notification_deliveries",
    );
    const insertIndex = repair.indexOf("insert into public.notification_deliveries");

    expect(reactivateIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThan(reactivateIndex);
    expect(repair).toContain("'reactivated', v_reactivated");
    expect(repair).toContain("p_limit > 100");
    expect(repair).not.toContain("solaris_enqueue_app_notifications");
  });

  it("lets ordinary provider execution converge reopened canonical state too", () => {
    const enqueue = functionBody("public.solaris_enqueue_app_notifications");

    expect(enqueue).toContain("private.solaris_suppress_stale_notification_deliveries(null)");
    expect(enqueue).toContain(
      "private.solaris_reactivate_expected_notification_deliveries(null, p_now)",
    );
    expect(enqueue).toContain("return v_inserted + v_reactivated");
    expect(enqueue).toContain("on conflict (user_id, dedupe_key) do nothing");
  });

  it("is a post-S13 forward-only contract rather than an unclassified migration", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261019113100_v3_s6_notification_reactivation");
    expect(migration).toContain("'forward_fix_only'");
  });
});
