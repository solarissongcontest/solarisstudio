import { createServerFn } from "@tanstack/react-start";

import type { PlatformOperationalMode } from "@/lib/platform-operational-mode";

export type PlatformExitPreflightCheck = {
  pass: boolean;
  critical: boolean;
  detail: string;
  [key: string]: unknown;
};

export type PlatformExitPreflightReceipt = {
  id: string;
  currentMode: "maintenance" | "read_only";
  targetMode: "read_only" | "degraded";
  platformVersion: number;
  ready: boolean;
  criticalFailures: string[];
  checks: Record<string, PlatformExitPreflightCheck>;
  createdAt: string;
  expiresAt: string;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function parseReceipt(value: unknown): PlatformExitPreflightReceipt {
  const row = object(value, "platform exit preflight receipt");
  const currentMode = row.currentMode;
  const targetMode = row.targetMode;
  if (currentMode !== "maintenance" && currentMode !== "read_only") {
    throw new Error("Solaris returned an invalid preflight source mode.");
  }
  if (targetMode !== "read_only" && targetMode !== "degraded") {
    throw new Error("Solaris returned an invalid preflight target mode.");
  }

  const rawChecks = object(row.checks, "platform exit preflight checks");
  const checks: Record<string, PlatformExitPreflightCheck> = {};
  for (const [key, raw] of Object.entries(rawChecks)) {
    const check = object(raw, `platform exit check ${key}`);
    checks[key] = {
      ...check,
      pass: check.pass === true,
      critical: check.critical === true,
      detail: typeof check.detail === "string" ? check.detail : "",
    };
  }

  const version = Number(row.platformVersion);
  if (!Number.isFinite(version)) {
    throw new Error("Solaris returned an invalid platform preflight version.");
  }

  return {
    id: String(row.id ?? ""),
    currentMode,
    targetMode,
    platformVersion: version,
    ready: row.ready === true,
    criticalFailures: Array.isArray(row.criticalFailures)
      ? row.criticalFailures.filter((item): item is string => typeof item === "string")
      : [],
    checks,
    createdAt: String(row.createdAt ?? ""),
    expiresAt: String(row.expiresAt ?? ""),
  };
}

export const runPlatformExitPreflight = createServerFn({ method: "POST" })
  .inputValidator((data: { targetMode: PlatformOperationalMode }) => {
    if (data?.targetMode !== "read_only" && data?.targetMode !== "degraded") {
      throw new Error("Exit preflight is only available for Read-only or Degraded recovery steps.");
    }
    return { targetMode: data.targetMode };
  })
  .handler(async ({ data }): Promise<PlatformExitPreflightReceipt> => {
    const {
      createSolarisAuthenticatedClientServer,
      requireSolarisOrganizerServer,
    } = await import("@/integrations/supabase/organizer.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadUnifiedSyncHealthServer } = await import(
      "@/integrations/unified/sync-health.functions"
    );

    const organizer = await requireSolarisOrganizerServer();
    const authenticated = createSolarisAuthenticatedClientServer() as any;

    const { data: databaseChecks, error: databaseError } = await authenticated.rpc(
      "studio2_platform_exit_database_preflight",
      { p_target_mode: data.targetMode },
    );
    if (databaseError) throw new Error(databaseError.message);

    const [syncHealth, storageProbe] = await Promise.all([
      loadUnifiedSyncHealthServer(),
      (async () => {
        try {
          const { data: buckets, error } = await (supabaseAdmin as any).storage.listBuckets();
          if (error) {
            return {
              healthy: false,
              message: String(error.message ?? "Storage API probe failed."),
              bucketCount: 0,
            };
          }
          return {
            healthy: true,
            message: "The server can reach the Storage API and enumerate buckets.",
            bucketCount: Array.isArray(buckets) ? buckets.length : 0,
          };
        } catch (caught) {
          return {
            healthy: false,
            message:
              caught instanceof Error
                ? caught.message.slice(0, 500)
                : "Storage API probe failed.",
            bucketCount: 0,
          };
        }
      })(),
    ]);

    const confirmationProblems = syncHealth.recentProblems.filter(
      (event) => event.service === "confirmations",
    );
    const votingProblems = syncHealth.recentProblems.filter(
      (event) => event.service === "televoting",
    );
    const confirmationHealthy = confirmationProblems.length === 0;
    const votingHealthy =
      syncHealth.televotingRuntime.status === "healthy" &&
      syncHealth.televotingRuntime.reachable &&
      syncHealth.televotingRuntime.organizerCompatibilityReady &&
      syncHealth.totals.staleTelevotingBindings === 0 &&
      votingProblems.length === 0;

    const externalChecks = {
      confirmationHealthy,
      votingHealthy,
      storageHealthy: storageProbe.healthy,
      confirmation: {
        healthy: confirmationHealthy,
        unresolvedEvents: confirmationProblems.length,
        problems: confirmationProblems.slice(0, 10).map((event) => ({
          id: event.id,
          status: event.status,
          eventType: event.eventType,
          lastError: event.lastError,
        })),
      },
      voting: {
        healthy: votingHealthy,
        runtime: syncHealth.televotingRuntime,
        staleBindings: syncHealth.totals.staleTelevotingBindings,
        unresolvedEvents: votingProblems.length,
        problems: votingProblems.slice(0, 10).map((event) => ({
          id: event.id,
          status: event.status,
          eventType: event.eventType,
          lastError: event.lastError,
        })),
      },
      storage: storageProbe,
    };

    const { data: recorded, error: recordError } = await (supabaseAdmin as any).rpc(
      "studio2_record_platform_exit_preflight",
      {
        p_actor_id: organizer.id,
        p_target_mode: data.targetMode,
        p_database_checks: databaseChecks,
        p_external_checks: externalChecks,
      },
    );
    if (recordError) {
      throw new Error(
        recordError.message ||
          "Solaris could not record the protected platform exit preflight.",
      );
    }

    return parseReceipt(recorded);
  });
