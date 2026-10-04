import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Solaris V6 permission authority retirement", () => {
  const migrationName = readdirSync(resolve(process.cwd(), "supabase/migrations")).find(
    (name) => name.endsWith("_permission_engine_v2_authoritative_cutover.sql"),
  );

  it("keeps Permission Engine v2 globally authoritative", () => {
    expect(migrationName).toBeTruthy();
    const migration = source(`supabase/migrations/${migrationName}`);

    expect(migration).toContain("create or replace function private.studio2_user_has_capability");
    expect(migration).toContain("create or replace function public.studio2_access_allowed");
    expect(migration).toContain("return private.studio2_user_has_capability");
    expect(migration).not.toContain(
      "not private.studio2_permission_engine_authoritative()",
    );
    expect(migration).toContain("Permission Engine v2 is not globally authoritative");
  });

  it("keeps legacy user_roles as rollback evidence rather than live authorization", () => {
    const migration = source(`supabase/migrations/${migrationName}`);

    expect(migration).toContain('drop policy if exists "bootstrap first organizer"');
    expect(migration).toContain(
      'drop policy if exists "capability managers grant legacy roles"',
    );
    expect(migration).toContain("delete from public.user_roles ur");
    expect(migration).toContain("drop function if exists public.has_role");
  });

  it("binds V6 presentation to the same capability contract without making client checks authoritative", () => {
    const authority = source("src/lib/solaris-v6-runtime-authority.ts");

    expect(authority).toContain('kind: "authorization-contract"');
    expect(authority).toContain("check: hasCapability");
    expect(authority).toContain("require: requireCapability");
    expect(authority).toContain("routeCapability: capabilityForOrganizerPath");
    expect(authority).toContain(
      "Client capability evaluation controls presentation only",
    );
  });
});
