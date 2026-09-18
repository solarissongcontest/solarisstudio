import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/_authenticated/admin/access-permissions.tsx");
const client = source("src/lib/permission-engine-admin.ts");
const simulation = source("src/components/admin/AccessSimulationPanel.tsx");
const navigation = source("src/components/admin/admin-navigation.ts");
const contextualNavigation = source("src/components/admin/admin-contextual-navigation.ts");
const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations"));
const migrationName = migrations.find((name) =>
  name.endsWith("_permission_engine_v2_foundation.sql"),
);

describe("Permission Engine v2 administration", () => {
  it("is discoverable inside Administration without creating another product surface", () => {
    expect(navigation).toContain("Access & permissions");
    expect(navigation).toContain("/admin/access-permissions");
    expect(contextualNavigation).toContain("Access & permissions");
    expect(route).toContain("type AccessTab =");
    for (const label of ["Users", "Roles", "Capabilities", "Access log", "Readiness"]) {
      expect(route).toContain(`label: "${label}"`);
    }
  });

  it("shows authoritative readiness and keeps recent evidence visible", () => {
    const readiness = source("src/components/admin/PermissionCutoverReadinessPanel.tsx");
    expect(route).toContain("<PermissionCutoverReadinessPanel");
    expect(readiness).toContain("Authoritative and verified");
    expect(readiness).toContain("Authoritative");
    expect(readiness).toContain("Advanced · completed cutover");
  });

  it("keeps access simulation explicitly read-only", () => {
    expect(route).toContain("<AccessSimulationPanel");
    expect(simulation).toContain("Access simulation · read only");
    expect(simulation).toMatch(/No actions can be executed from this\s+simulation\./);
    expect(simulation).toContain("Organizer domains visible");
    expect(simulation).toContain('title="Routes"');
    expect(simulation).toContain('title="Actions"');
    expect(simulation).toContain("Advanced · effective capability keys");
    expect(client).toContain("readOnly: true");
    expect(client).toContain("studio2_view_access_as");
  });

  it("records authoritative decisions and presents v2 as enforcement", () => {
    expect(route).toContain("Permission Engine v2 is authoritative.");
    expect(route).toMatch(/Active role\s+assignments and direct capability grants now decide protected access/);
    expect(client).toContain("studio2_check_capability_shadow");
    expect(route).toContain('action: "permissions.workspace.view"');
  });

  it("ships the catalog and telemetry migration without enabling rollout", () => {
    expect(migrationName).toBeTruthy();
    const migration = source(`supabase/migrations/${migrationName}`);
    expect(migration).toContain("create table public.studio2_capabilities");
    expect(migration).toContain("create table public.permission_evaluation_events");
    expect(migration).toContain("studio2_check_capability_shadow");
    expect(migration).toContain(
      "This migration deliberately does not enable the permission_engine_v2 rollout flag.",
    );
    expect(migration).not.toContain("set enabled = true");
  });
});
