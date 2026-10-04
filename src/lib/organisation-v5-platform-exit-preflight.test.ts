import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 Maintenance exit preflight", () => {
  const migration = source(
    "supabase/migrations/20261003213000_organisation_os_v5_platform_exit_preflight.sql",
  );
  const enforcement = source(
    "supabase/migrations/20261003210000_organisation_os_v5_read_only_enforcement.sql",
  );
  const server = source("src/lib/platform-exit-preflight.functions.ts");
  const syncHealth = source("src/integrations/unified/sync-health.functions.ts");
  const client = source("src/lib/platform-operational-mode.ts");
  const system = source("src/routes/_authenticated/admin/system.tsx");

  it("implements every source-defined Maintenance exit check", () => {
    for (const check of [
      "database_health",
      "auth_health",
      "critical_service_reads",
      "critical_safe_write",
      "confirmation_sync",
      "voting_health",
      "storage",
      "pending_scheduled_operations",
      "expired_deadlines",
      "replacement_communication_requirements",
    ]) {
      expect(migration).toContain(`'${check}'`);
    }
    expect(migration).toContain("studio2_platform_exit_write_probe");
    expect(migration).toContain("integration_events");
    expect(migration).toContain("televoting_round_bindings");
    expect(migration).toContain("studio2_show_publication_controls");
    expect(migration).toContain("studio2_official_notices");
    expect(migration).toContain("admin_deadlines");
  });

  it("uses a short-lived actor/version-bound receipt and consumes it once", () => {
    expect(migration).toContain("studio2_platform_exit_preflights");
    expect(migration).toContain("interval '5 minutes'");
    expect(migration).toContain("actor_id = v_actor");
    expect(migration).toContain("v_preflight.platform_version <> v_state.version");
    expect(migration).toContain("v_preflight.expires_at <= now()");
    expect(migration).toContain("v_preflight.consumed_at is not null");
    expect(migration).toContain("set consumed_at = now()");
    expect(migration).toContain("p_exit_preflight_id uuid");
  });

  it("keeps the cross-service attestation server-only", () => {
    expect(migration).toContain("studio2_record_platform_exit_preflight");
    expect(migration).toContain(
      "from public, anon, authenticated",
    );
    expect(migration).toContain("to service_role");
    expect(server).toContain("requireSolarisOrganizerServer");
    expect(server).toContain("loadUnifiedSyncHealthServer");
    expect(server).toContain("storage.listBuckets");
    expect(server).toContain("staleTelevotingBindings");
    expect(server).toContain("studio2_record_platform_exit_preflight");
    expect(syncHealth).toContain("export async function loadUnifiedSyncHealthServer");
  });

  it("rechecks database-critical health at the actual mode mutation", () => {
    expect(migration).toContain(
      "v_db_recheck := public.studio2_platform_exit_database_preflight(v_target)",
    );
    expect(migration).toContain(
      "Maintenance exit database checks changed after preflight",
    );
    expect(migration).toContain("private.studio2_require_fresh_auth(300)");
    expect(migration).toContain("'exitPreflightId', p_exit_preflight_id");
  });

  it("allows only protected preflight/apply RPCs through restricted PostgREST", () => {
    expect(enforcement).toContain("'studio2_apply_platform_mode_change'");
    expect(enforcement).toContain("'studio2_platform_exit_database_preflight'");
    expect(enforcement).toContain("'studio2_record_platform_exit_preflight'");
    expect(enforcement).toContain("proc.provolatile in ('s', 'i')");
  });

  it("binds the Organizer UI apply action to the preflight receipt", () => {
    expect(client).toContain("p_exit_preflight_id: input.exitPreflightId ?? null");
    expect(system).toContain("runPlatformExitPreflight");
    expect(system).toContain("Maintenance exit preflight");
    expect(system).toContain("Critical checks passed");
    expect(system).toContain("Database-critical checks run again");
    expect(system).toContain("exitPreflightId: pending.exitPreflight?.id ?? null");
    expect(system).toContain("pendingModeChange.exitPreflight.ready");
  });
});
