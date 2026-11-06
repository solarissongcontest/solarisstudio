import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const compatibility = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261102205000_v3_service_role_claim_compatibility.sql"),
  "utf8",
);
const resultTruth = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017001000_v3_s14_televote_result_truth.sql"),
  "utf8",
);

function functionBody(sql: string, name: string) {
  const marker = `create or replace function ${name}(`;
  const start = sql.lastIndexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf("create or replace function", start + marker.length);
  return sql.slice(start, next === -1 ? sql.length : next);
}

describe("V3 service-role request claim compatibility", () => {
  it("declares S13 migration adoption explicitly", () => {
    expect(compatibility).toContain("insert into private.v3_migration_contracts");
    expect(compatibility).toContain("'v3.s14.service-role-claim-compatibility'");
    expect(compatibility).toContain("'forward_fix_only'");
    expect(compatibility).toContain("destructive");
    expect(compatibility).toContain("false");
  });

  it("recognizes service-role requests from legacy scalar or JSON JWT claims", () => {
    const body = functionBody(compatibility, "private.studio2_request_is_service_role");

    expect(body).toContain("current_setting('request.jwt.claim.role', true)");
    expect(body).toContain("current_setting('request.jwt.claims', true)");
    expect(body).toContain("::jsonb ->> 'role'");
    expect(body).toContain("= 'service_role'");
    expect(body).not.toContain("auth.uid()");
  });

  it("does not weaken Televote projection-status authorization", () => {
    const body = functionBody(resultTruth, "public.studio2_televote_projection_status");

    expect(body).toContain("private.studio2_request_is_service_role()");
    expect(body).toContain("public.studio2_access_allowed('voting.read'");
    expect(body).toContain("public.studio2_access_allowed('system.read'");
    expect(body).toContain("Missing Solaris capability: voting.read");
  });
});
