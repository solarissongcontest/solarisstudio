import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20261104121700_v3_tg2_public_recognition_boundary.sql");
const fixture = read("scripts/rehearse-v3-world-public-recognition-privacy.sql");
const wrapper = read("scripts/rehearse-v3-world-public-recognition-privacy.sh");

function policyBetween(name: string, next: string): string {
  const start = migration.indexOf("create policy " + name);
  const end = migration.indexOf(next, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("TG19 unrecognized institution public privacy / dark rollout", () => {
  it("is a forward-only additive migration after TG2 effective-membership authority", () => {
    expect(migration).toContain("begin;");
    expect(migration).toContain("'v3.tg2.public-recognition-boundary'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/\bdrop\s+(?:table|function)\b/i);
    expect(migration).not.toMatch(/\bgrant\s+(?:insert|update|delete|all)\b[^;]*\bto\s+(?:anon|authenticated)\b/i);
  });

  it("blocks public proposed/private institution rows at the RLS boundary, not just UI", () => {
    const publicOrg = policyBetween("world_organizations_public_read", "drop policy if exists world_organs_public_read");
    expect(publicOrg).toContain("for select to anon, authenticated");
    expect(publicOrg).toContain("public_visibility = 'public'");
    expect(publicOrg).toContain("status in ('recognized','active','suspended','dissolved','historical')");
    expect(publicOrg).not.toMatch(/'proposed'/);
    expect(publicOrg).toContain("studio2_feature_enabled('terra_world_public', null)");
  });

  it("extends the same recognized-state boundary to public organs, memberships and offices", () => {
    for (const [name, next] of [
      ["world_organs_public_read", "drop policy if exists world_memberships_public_read"],
      ["world_memberships_public_read", "drop policy if exists world_offices_public_read"],
      ["world_offices_public_read", "-- SECURITY DEFINER bypasses row RLS"],
    ] as const) {
      const policy = policyBetween(name, next);
      expect(policy).toContain("studio2_feature_enabled('terra_world_public', null)");
      expect(policy).toContain("public_visibility = 'public'");
      expect(policy).toContain("status in ('recognized','active','suspended','dissolved','historical')");
    }
    const office = policyBetween("world_offices_public_read", "-- SECURITY DEFINER bypasses row RLS");
    expect(office).toContain("visible_organ.visibility = 'public'");
    expect(office).toContain("visible_organ.organization_id = world_organization_offices.organization_id");
    expect(migration).not.toContain("drop policy if exists world_offices_private_scoped_read");
  });

  it("enforces the publication boundary inside the SECURITY DEFINER RPC", () => {
    const definer = migration.slice(
      migration.indexOf("create or replace function public.world_organization_projection_v1"),
      migration.indexOf("revoke all on function public.world_organization_projection_v1"),
    );
    expect(definer).toContain("security definer");
    expect(definer).toContain("organization_row.status in ('recognized','active','suspended','dissolved','historical')");
    expect(definer).toContain("studio2_feature_enabled('terra_world_public', null)");
    expect(definer).toContain("visible_organ.visibility = 'public'");
    expect(definer).not.toMatch(/\bholder_user_id\b|\bproxy_user_id\b/);
    expect(migration).toContain("grant execute on function public.world_organization_projection_v1(text)");
  });

  it("has a real-role rollback-only negative and positive RLS rehearsal", () => {
    expect(fixture.trimStart().startsWith("-- Run ONLY via the loopback-only wrapper")).toBe(true);
    expect(fixture).toContain("set local role anon");
    expect(fixture).toContain("set local role authenticated");
    expect(fixture.trimEnd().endsWith("rollback;")).toBe(true);
    for (const failure of [
      "TG19_WORLD_DARK_FLAG_DIRECT_TABLE_LEAK",
      "TG19_WORLD_DARK_FLAG_SECURITY_DEFINER_LEAK",
      "TG19_WORLD_PROPOSED_OR_PRIVATE_TABLE_LEAK",
      "TG19_WORLD_PROPOSED_SECURITY_DEFINER_LEAK",
      "TG19_WORLD_PRIVATE_ORGAN_LEAK",
      "TG19_WORLD_PROPOSED_OFFICE_LEAK",
      "TG19_WORLD_UNSCOPED_AUTH_INSTITUTION_LEAK",
    ]) expect(fixture).toContain(failure);
  });

  it("refuses nonlocal Supabase and never evaluates untrusted status output", () => {
    expect(wrapper).toContain("set -euo pipefail");
    expect(wrapper).toContain("supabase status -o env");
    expect(wrapper).toContain("127.0.0.1");
    expect(wrapper).toContain("localhost");
    expect(wrapper).toContain("Refusing hosted/non-loopback");
    expect(wrapper).toContain("psql \"$DB_URL\"");
    expect(wrapper).not.toMatch(/\beval\b|\bcurl\b|\bwget\b/);
  });
});
