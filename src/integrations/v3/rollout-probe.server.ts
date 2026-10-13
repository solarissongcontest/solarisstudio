import { getRequestHeader } from "@tanstack/react-start/server";

import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import { resolveCurrentPublicEdition } from "@/lib/current-contest-state";
import type { Edition } from "@/lib/data";

const EDITION_COLUMNS =
  "id,edition_number,name,year,slug,description,host_country_id,host_city,logo,theme_id,status,published";

type RolloutClient = {
  auth?: {
    getUser(token?: string): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  from(table: string): any;
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

export type V3RolloutProbe = {
  enabled: boolean;
  confirmationEnabled: boolean;
  scoreboardEnabled: boolean;
  accountSettingsEnabled: boolean;
  exploreEnabled: boolean;
  notificationsEnabled: boolean;
  editionEnabled: boolean;
  editionId: string | null;
  userId: string | null;
};

function bearerToken() {
  const header = getRequestHeader("authorization")?.trim() ?? "";
  if (!header) return null;
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

async function rolloutClientForRequest(publicClient: RolloutClient) {
  const token = bearerToken();
  if (!token) return { client: publicClient, userId: null };

  try {
    const authenticated =
      createSolarisAuthenticatedClientServer() as unknown as RolloutClient;
    const { data, error } = await authenticated.auth!.getUser(token);
    if (error || !data.user) return { client: publicClient, userId: null };
    return { client: authenticated, userId: data.user.id };
  } catch {
    return { client: publicClient, userId: null };
  }
}

function disabledProbe(input?: { editionId?: string | null; userId?: string | null }): V3RolloutProbe {
  return {
    enabled: false,
    confirmationEnabled: false,
    scoreboardEnabled: false,
    accountSettingsEnabled: false,
    exploreEnabled: false,
    notificationsEnabled: false,
    editionEnabled: false,
    editionId: input?.editionId ?? null,
    userId: input?.userId ?? null,
  };
}

/**
 * Cheap, fail-closed V3 rollout probe.
 *
 * This intentionally runs before heavier V3 surface bootstraps so disabled
 * production users do not pay for duplicate data graphs. The persisted Studio 2
 * flags remain the sole rollout authority; errors resolve to disabled. Migrated
 * surfaces have independent slice flags so the V3 shell can remain on while one
 * surface is rolled back without affecting the others.
 */
export async function loadV3RolloutProbe(): Promise<V3RolloutProbe> {
  try {
    const publicClient =
      createConfirmationPublicRuntimeClient() as unknown as RolloutClient;
    const editionResult = await publicClient
      .from("editions")
      .select(EDITION_COLUMNS)
      .eq("published", true)
      .order("edition_number", { ascending: false });

    if (editionResult.error) return disabledProbe();

    const edition = resolveCurrentPublicEdition(
      ((editionResult.data ?? []) as Edition[]),
    );
    const editionId = edition?.id ?? null;
    const { client, userId } = await rolloutClientForRequest(publicClient);
    const [
      globalFlag,
      confirmationFlag,
      scoreboardFlag,
      accountSettingsFlag,
      exploreFlag,
      notificationsFlag,
      editionFlag,
    ] = await Promise.all([
      client.rpc("studio2_feature_enabled", {
        p_key: "solaris_app_v3",
        p_edition_id: editionId,
      }),
      client.rpc("studio2_feature_enabled", {
        p_key: "solaris_app_v3_confirmation",
        p_edition_id: editionId,
      }),
      client.rpc("studio2_feature_enabled", {
        p_key: "solaris_app_v3_scoreboard",
        p_edition_id: editionId,
      }),
      client.rpc("studio2_feature_enabled", {
        p_key: "solaris_app_v3_account_settings",
        p_edition_id: editionId,
      }),
      client.rpc("studio2_feature_enabled", {
        p_key: "solaris_app_v3_explore",
        p_edition_id: editionId,
      }),
      client.rpc("studio2_feature_enabled", {
        p_key: "solaris_app_v3_notifications",
        p_edition_id: editionId,
      }),
      client.rpc("studio2_feature_enabled", {
        p_key: "solaris_app_v3_edition",
        p_edition_id: editionId,
      }),
    ]);

    if (globalFlag.error) return disabledProbe({ editionId, userId });

    const enabled = globalFlag.data === true;
    const confirmationEnabled =
      enabled && !confirmationFlag.error && confirmationFlag.data === true;
    const scoreboardEnabled =
      enabled && !scoreboardFlag.error && scoreboardFlag.data === true;
    const accountSettingsEnabled =
      enabled && !accountSettingsFlag.error && accountSettingsFlag.data === true;
    const exploreEnabled =
      enabled && !exploreFlag.error && exploreFlag.data === true;
    const notificationsEnabled =
      accountSettingsEnabled &&
      !notificationsFlag.error &&
      notificationsFlag.data === true;
    const editionEnabled =
      exploreEnabled && !editionFlag.error && editionFlag.data === true;

    return {
      enabled,
      confirmationEnabled,
      scoreboardEnabled,
      accountSettingsEnabled,
      exploreEnabled,
      notificationsEnabled,
      editionEnabled,
      editionId,
      userId,
    };
  } catch {
    return disabledProbe();
  }
}
