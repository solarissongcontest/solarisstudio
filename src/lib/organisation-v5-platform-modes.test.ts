import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 platform operational modes", () => {
  const migration = source(
    "supabase/migrations/20261003174000_organisation_os_v5_platform_operational_modes.sql",
  );
  const emergencyServer = source("src/server.ts");
  const emergencyConfig = source("src/lib/maintenance.ts");
  const client = source("src/lib/platform-operational-mode.ts");
  const systemRoute = source("src/routes/_authenticated/admin/system.tsx");

  it("defines one canonical four-mode platform state and permission", () => {
    expect(migration).toContain("'maintenance.manage'");
    expect(migration).toContain("studio2_platform_operational_state");
    for (const mode of ["'normal'", "'degraded'", "'read_only'", "'maintenance'"]) {
      expect(migration).toContain(mode);
    }
    expect(migration).toContain("('superadmin', 'maintenance.manage')");
    expect(migration).toContain("('organizer', 'maintenance.manage')");
  });

  it("enforces a deliberate recovery transition graph server-side", () => {
    expect(migration).toContain("studio2_platform_mode_transition_allowed");
    expect(migration).toContain(
      "when p_from = 'normal'\n      then p_to in ('degraded', 'read_only', 'maintenance')",
    );
    expect(migration).toContain(
      "when p_from = 'degraded'\n      then p_to in ('normal', 'read_only', 'maintenance')",
    );
    expect(migration).toContain(
      "when p_from = 'read_only'\n      then p_to in ('degraded', 'maintenance')",
    );
    expect(migration).toContain(
      "when p_from = 'maintenance'\n      then p_to = 'read_only'",
    );
  });

  it("versions and previews mode changes before applying them", () => {
    expect(migration).toContain("studio2_platform_mode_change_preview");
    expect(migration).toContain("studio2_apply_platform_mode_change");
    expect(migration).toContain("'expectedVersion', v_state.version");
    expect(migration).toContain("p_expected_version bigint");
    expect(migration).toContain("using errcode = '40001'");
    expect(migration).toContain("pg_catalog, public, private");
  });

  it("requires fresh authentication for read-only or maintenance transitions", () => {
    expect(migration).toContain("then 'R3'");
    expect(migration).toContain("private.studio2_require_fresh_auth(300)");
    expect(migration).toContain("actor_session_id = v_auth_evidence ->> 'sessionId'");
    expect(migration).toContain("auth_freshness_evidence = v_auth_evidence");
  });

  it("blocks new V5 operation-contract writes while preserving successful receipt replay", () => {
    const replayIndex = migration.indexOf("if v_receipt.status = 'succeeded' then");
    const modeGuardIndex = migration.indexOf(
      "private.studio2_platform_mutation_allowed(v_command)",
      replayIndex,
    );

    expect(replayIndex).toBeGreaterThan(-1);
    expect(modeGuardIndex).toBeGreaterThan(replayIndex);
    expect(migration).toContain(
      "when 'read_only' then coalesce(p_command, '') in (",
    );
    expect(migration).toContain(
      "when 'maintenance' then coalesce(p_command, '') = 'system.platform_mode.change'",
    );
    expect(migration).toContain("using errcode = '25006'");
    expect(migration).toContain("false\n  );");
  });

  it("exposes canonical mode state and stable retry identity through the Organizer client", () => {
    expect(client).toContain("studio2_platform_operational_snapshot");
    expect(client).toContain("studio2_platform_mode_change_preview");
    expect(client).toContain("studio2_apply_platform_mode_change");
    expect(client).toContain("reauthenticatePlatformR3");
    expect(client).toContain("supabase.auth.signInWithPassword");
    expect(client).toContain("operationId: input.operationId");
    expect(client).toContain("idempotencyKey: input.idempotencyKey");
  });

  it("makes platform mode transitions usable from the existing Organizer System surface", () => {
    expect(systemRoute).toContain("Platform operational mode");
    expect(systemRoute).toContain("Choose a legal transition");
    expect(systemRoute).toContain("Review mode change");
    expect(systemRoute).toContain("Fresh authentication required");
    expect(systemRoute).toContain("Maintenance cannot jump directly to Normal");
    expect(systemRoute).toContain("operationId");
    expect(systemRoute).toContain("idempotencyKey");
    expect(systemRoute).toContain("nextPlatformModes");
    expect(systemRoute).toContain('case "maintenance":');
    expect(systemRoute).toContain('return ["read_only"]');
  });

  it("audits transitions without replacing the independent emergency circuit breaker", () => {
    expect(migration).toContain("'platform_operational_mode_changed'");
    expect(migration).toContain("'fromMode', v_before_mode");
    expect(migration).toContain("'reason', v_state.reason");

    expect(emergencyServer).toContain('MAINTENANCE_ADMIN_SECRET');
    expect(emergencyServer).toContain('const MAINTENANCE_ADMIN_PATH = "/__maintenance-admin"');
    expect(emergencyConfig).toContain("GLOBAL_MAINTENANCE_MODE");
    expect(migration).not.toContain("MAINTENANCE_ADMIN_SECRET");
  });
});
