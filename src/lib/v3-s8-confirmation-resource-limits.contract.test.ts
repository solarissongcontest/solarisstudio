import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261016063000_v3_s8_confirmation_resource_limits.sql"),
  "utf8",
);
const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s8-confirmation-resource-limits-rehearsal.sh"),
  "utf8",
);
const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/v3-s8-confirmation-resource-limits-rehearsal.yml"),
  "utf8",
);

describe("System V3 S8 Confirmation resource limits", () => {
  it("uses one 32 KiB invariant at RPC and table boundaries", () => {
    expect(migration).toContain("private.v3_assert_confirmation_draft_resource_budget");
    expect(migration).toContain("octet_length(p_payload::text) > 32768");
    expect(migration).toContain("check (octet_length(payload::text) <= 32768) not valid");
    expect(migration).toContain("validate constraint submission_drafts_payload_resource_budget");
  });

  it("preserves both legacy and V3 draft contracts while enforcing the same budget", () => {
    expect(migration).toContain("create or replace function public.public_save_draft");
    expect(migration).toContain("create or replace function public.v3_save_confirmation_draft");
    expect(migration.match(/perform private\.v3_assert_confirmation_draft_resource_budget\(_payload\);/g)?.length).toBe(2);
    expect(migration).toContain("to anon, authenticated, service_role;");
  });

  it("keeps the resource assertion inaccessible to browser roles", () => {
    expect(migration).toContain("revoke all on function private.v3_assert_confirmation_draft_resource_budget(jsonb)");
    expect(migration).toContain("from public, anon, authenticated;");
  });

  it("rehearses accepted, rejected and direct-write paths only on local Supabase", () => {
    expect(rehearsal).toContain("30 KiB-class V3 draft remains within budget");
    expect(rehearsal).toContain("oversized V3 draft");
    expect(rehearsal).toContain("oversized legacy draft");
    expect(rehearsal).toContain("direct oversized draft insert");
    expect(rehearsal).toContain("rejected V3 update preserves earlier payload");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase migration up --local --include-all");
    expect(workflow).not.toMatch(/supabase\.co/i);
  });
});
