import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261019113200_v3_s6_notification_failure_visibility.sql",
  ),
  "utf8",
);

describe("System V3 S6 failed notification visibility", () => {
  it("reports expected failed deliveries as drift instead of successful convergence", () => {
    expect(migration).toContain("v_failed_expected integer := 0");
    expect(migration).toContain("delivery.status = 'failed'");
    expect(migration).toContain("'failedExpected', v_failed_expected");
    expect(migration).toContain("and v_failed_expected = 0");
  });

  it("keeps verification read-only so failed delivery retry remains governed elsewhere", () => {
    expect(migration).not.toMatch(/\binsert\s+into\s+public\.notification_deliveries\b/i);
    expect(migration).not.toMatch(/\bupdate\s+public\.notification_deliveries\b/i);
    expect(migration).not.toContain("admin_retry_failed_notification_delivery");
    expect(migration).toContain("private.studio2_request_is_service_role()");
  });

  it("preserves the bounded unknown state above the diagnostic ceiling", () => {
    expect(migration).toContain("p_limit > 500");
    expect(migration).toContain("'state', 'unknown'");
    expect(migration).toContain("'reason', 'verification_bound_exceeded'");
  });

  it("is classified by the S13 migration framework", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("20261019113200_v3_s6_notification_failure_visibility");
    expect(migration).toContain("'forward_fix_only'");
  });
});
