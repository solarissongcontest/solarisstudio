import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find((name) =>
  name.endsWith("_permission_engine_v2_country_ownership_rpc_cutover.sql"),
);
if (!migrationName) throw new Error("country ownership RPC cutover migration missing");

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations", migrationName), "utf8");

function block(qualifiedName: string) {
  const marker = `create or replace function ${qualifiedName}`;
  const lower = migration.toLowerCase();
  const start = lower.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = lower.indexOf("create or replace function", start + marker.length);
  return migration.slice(start, next === -1 ? migration.length : next);
}

describe("country ownership Permission Engine RPC cutover", () => {
  it("preserves the exact pre-cutover Organizer claim block in one private compatibility helper", () => {
    const helper = block("private.studio2_country_claim_blocked");
    expect(helper).toContain("studio2_permission_engine_authoritative()");
    expect(helper).toContain("studio2_user_has_capability(p_user_id, 'delegation.manage', null)");
    expect(helper).toContain("public.has_role(p_user_id, 'organizer'::public.app_role)");

    const claim = block("public.claim_country_account");
    expect(claim).toContain("private.studio2_country_claim_blocked(v_user_id)");
    expect(claim).not.toContain("has_role");
  });

  it("moves delegated ownership inspection to strict global delegation.read", () => {
    const fn = block("public.owns_country");
    expect(fn).toContain("_user_id = auth.uid()");
    expect(fn).toContain("studio2_access_allowed('delegation.read', null, true)");
    expect(fn).toContain("from public.country_accounts ca");
    expect(fn).not.toContain("has_role");
  });

  it("preserves country-owner section reordering and makes staff editing strict delegation.manage", () => {
    const fn = block("public.reorder_country_profile_sections");
    expect(fn).toContain("public.owns_country(_country_id)");
    expect(fn).toContain("studio2_access_allowed('delegation.manage', null, true)");
    expect(fn).toContain("Section order must contain every country section exactly once.");
    expect(fn).toContain("Section order contains duplicates.");
    expect(fn).toContain("Section does not belong to this country.");
    expect(fn).not.toContain("has_role");
  });

  it("keeps the claim helper private from browser roles", () => {
    expect(migration).toContain(
      "revoke all on function private.studio2_country_claim_blocked(uuid) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function private.studio2_country_claim_blocked(uuid) to service_role;",
    );
  });

  it("keeps the three public RPCs authenticated/service-role only", () => {
    expect(migration.match(/from public, anon;/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration.match(/to authenticated, service_role;/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("does not enable Permission Engine v2", () => {
    expect(migration).not.toContain("update public.studio2_feature_flags");
    expect(migration).not.toContain("insert into public.studio2_feature_flags");
  });
});
