import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations"));
const migrationName = migrations.find((name) =>
  name.endsWith("_permission_engine_v2_authoritative_cutover.sql"),
);
if (!migrationName) throw new Error("Authoritative Permission Engine cutover migration missing");

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations", migrationName),
  "utf8",
);

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function blockBetween(start: string, end: string) {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe("Permission Engine v2 authoritative cutover", () => {
  it("requires real zero-mismatch evidence and complete live Organizer coverage", () => {
    expect(migration).toContain("created_at >= now() - interval '30 days'");
    expect(migration).toContain("if v_evaluations = 0 then");
    expect(migration).toContain("if v_mismatches <> 0 then");
    expect(migration).toContain("v_live_organizers <> v_covered_organizers");
    expect(migration).toContain("a.role_key in ('organizer', 'superadmin')");
  });

  it("removes the legacy capability fallback", () => {
    const block = blockBetween(
      "create or replace function private.studio2_user_has_capability",
      "create or replace function private.studio2_user_is_global_organizer",
    );
    expect(block).toContain("studio2_capability_grants");
    expect(block).toContain("studio2_role_assignments");
    expect(block).not.toContain("user_roles");
    expect(block).not.toContain("permission_engine_authoritative");
  });

  it("keeps stable public capability helpers for app and RLS callers", () => {
    expect(migration).toContain("create or replace function public.studio2_is_global_organizer()");
    expect(migration).toContain("create or replace function public.studio2_current_capabilities");
    expect(migration).toContain("create or replace function public.studio2_access_allowed");
    expect(migration).toContain("private.studio2_user_is_global_organizer(p_user_id)");
  });

  it("retires legacy role mutation and helper surfaces", () => {
    expect(migration).toContain('drop policy if exists "bootstrap first organizer"');
    expect(migration).toContain('drop policy if exists "capability managers grant legacy roles"');
    expect(migration).toContain("drop function public.has_role(uuid, public.app_role);");
    expect(migration).toContain("drop function public.organizer_exists();");
    expect(migration).toContain("delete from public.user_roles ur");
  });

  it("turns the global flag on only after legacy helper verification", () => {
    const verify = migration.indexOf("do $legacy_helper_verify$");
    const enable = migration.indexOf("update public.studio2_feature_flags");
    expect(verify).toBeGreaterThanOrEqual(0);
    expect(enable).toBeGreaterThan(verify);
    expect(migration).toContain("where key = 'permission_engine_v2'");
    expect(migration).toContain("enabled = true");
    expect(migration).toContain("private.studio2_permission_engine_authoritative()");
  });

  it("moves runtime Organizer gates off user_roles", () => {
    const runtimeFiles = [
      "src/integrations/supabase/organizer.server.ts",
      "src/integrations/supabase/capabilities.server.ts",
      "src/routes/_authenticated/admin/route.tsx",
      "src/integrations/confirmations/admin.ts",
      "src/lib/country-account.ts",
      "src/components/admin/UnifiedServiceAdminGate.tsx",
      "src/lib/data.ts",
    ];

    for (const path of runtimeFiles) {
      const code = source(path);
      expect(code).not.toMatch(/\.from\((?:"|')user_roles(?:"|')\)/);
    }

    expect(source("src/integrations/supabase/organizer.server.ts")).toContain(
      "studio2_is_global_organizer",
    );
    expect(source("src/integrations/supabase/capabilities.server.ts")).toContain(
      "studio2_current_capabilities",
    );
    expect(source("src/integrations/supabase/capabilities.server.ts")).not.toContain(
      "legacyOrganizerCapabilities",
    );
  });
});
