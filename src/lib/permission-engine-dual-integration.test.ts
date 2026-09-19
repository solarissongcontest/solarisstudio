import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const shell = source("src/components/admin/AdminShell.tsx");
const probe = source("src/components/admin/AdminPermissionShadowProbe.tsx");
const frame = source("src/components/admin/AdminFrame.tsx");
const migrations = readdirSync(resolve(process.cwd(), "supabase/migrations"));
const migrationName = migrations.find((name) =>
  name.endsWith("_permission_engine_v2_dual_enforcement.sql"),
);

describe("Permission Engine v2 dual enforcement batch", () => {
  it("records non-blocking route decisions from the shared Organizer shell", () => {
    expect(shell).toContain("<AdminPermissionShadowProbe />");
    expect(probe).toContain("capabilityForOrganizerPath");
    expect(probe).toContain('action: "organizer.route.view"');
    expect(probe).toContain("retry: false");
  });

  it("keeps Access & Permissions inside the mobile Administration family", () => {
    expect(frame).toContain('label: "More"');
    expect(frame).toContain('href: "/admin/more"');
    expect(frame).toContain('!editionRoute(path)');
    expect(frame).toContain('!casesRoute(path)');
  });

  it("adds capability checks to the remaining legacy-only Studio 2 writes", () => {
    expect(migrationName).toBeTruthy();
    const migration = source(`supabase/migrations/${migrationName}`);
    expect(migration).toContain(
      "private.studio2_user_has_capability(v_actor, 'jury.ballots.manage'",
    );
    expect(migration).toContain("private.studio2_user_has_capability(v_actor, 'rollout.manage'");
    expect(migration).toContain("public.owns_country(v_actor, p_country_id)");
    expect(migration).toContain("for every existing and requested edition scope");
  });
});
