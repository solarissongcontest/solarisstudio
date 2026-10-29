import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const permissionMap = readFileSync(
  new URL("./permission-route-map.ts", import.meta.url),
  "utf8",
);
const registry = readFileSync(
  new URL("./v3-organizer-capability-registry.ts", import.meta.url),
  "utf8",
);
const telemetryMigration = readFileSync(
  new URL("../../supabase/migrations/20260919112555_public_ux_telemetry.sql", import.meta.url),
  "utf8",
);

describe("Organizer V3 Public UX authorization parity", () => {
  it("maps the restricted Public UX workspace to rollout.manage", () => {
    const publicUxIndex = permissionMap.indexOf('"/admin/public-ux"');
    const rolloutIndex = permissionMap.indexOf('"rollout.manage"', publicUxIndex);

    expect(publicUxIndex).toBeGreaterThan(-1);
    expect(rolloutIndex).toBeGreaterThan(publicUxIndex);
    expect(permissionMap.slice(publicUxIndex, rolloutIndex + 32)).toContain('"rollout.manage"');
  });

  it("matches the existing database authorization contract", () => {
    expect(telemetryMigration).toContain(
      "public.studio2_access_allowed('rollout.manage', null, false)",
    );
    expect(telemetryMigration).toContain(
      "create or replace function public.admin_public_ux_metrics",
    );
  });

  it("keeps Public UX classified as a restricted building capability", () => {
    expect(registry).toContain('"workspace-public-ux": "restrict"');
    expect(registry).toContain('id === "workspace-public-ux"');
    expect(registry).not.toContain('id === "workspace-public-ux") return "parity"');
  });
});