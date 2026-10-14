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
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{
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
  editionHubEnabled: boolean;
  notificationsEnabled: boolean;
  delegationEnabled: boolean;
  searchEnabled: boolean;
  rulesGuidanceEnabled: boolean;
  resultsEnabled?: boolean;
  meEnabled?: boolean;
  entryEnabled?: boolean;
  juryEnabled?: boolean;
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
    const authenticated = createSolarisAuthenticatedClientServer() as unknown as RolloutClient;
    const { data, error } = await authenticated.auth!.getUser(token);
    if (error || !data.user) return { client: publicClient, userId: null };
    return { client: authenticated, userId: data.user.id };
  } catch {
    return { client: publicClient, userId: null };
  }
}

function disabledProbe(input?: {
  editionId?: string | null;
  userId?: string | null;
}): V3RolloutProbe {
  return {
    enabled: false,
    confirmationEnabled: false,
    scoreboardEnabled: false,
    accountSettingsEnabled: false,
    exploreEnabled: false,
    editionHubEnabled: false,
    notificationsEnabled: false,
    delegationEnabled: false,
    searchEnabled: false,
    rulesGuidanceEnabled: false,
    resultsEnabled: false,
    meEnabled: false,
    entryEnabled: false,
    juryEnabled: false,
    editionId: input?.editionId ?? null,
    userId: input?.userId ?? null,
  };
}

async function evaluateV3Rollout(
  publicClient: RolloutClient,
  editionId: string | null,
): Promise<V3RolloutProbe> {
  const { client, userId } = await rolloutClientForRequest(publicClient);
  const [
    globalFlag,
    confirmationFlag,
    scoreboardFlag,
    accountSettingsFlag,
    exploreFlag,
    editionHubFlag,
    notificationsFlag,
    delegationFlag,
    searchFlag,
    rulesGuidanceFlag,
    meFlag,
    resultsFlag,
    entryFlag,
    juryFlag,
  ] = await Promise.all([
    client.rpc("studio2_feature_enabled", { p_key: "solaris_app_v3", p_edition_id: editionId }),
    client.rpc("studio2_feature_enabled", { p_key: "solaris_app_v3_confirmation", p_edition_id: editionId }),
    client.rpc("studio2_feature_enabled", { p_key: "solaris_app_v3_scoreboard", p_edition_id: editionId }),
    client.rpc("studio2_feature_enabled", { p_key: "solaris_app_v3_account_settings", p_edition_id: editionId }),
    client.rpc("studio2_feature_enabled", { p_key: "solaris_app_v3_explore", p_edition_id: editionId }),
    client.rpc("studio2_feature_enabled", { p_key: "solaris_app_v3_edition_hub", p_edition_id: editionId }),
    client.rpc("studio2_feature_enabled", { p_key: "solaris_app_v3_notifications", p_edition_id: editionId }),
    client.rpc("studio2_feature_enabled", { p_key: "solaris_app_v3_delegation", p_edition_id: editionId }),
    client.rpc("studio2_feature_enabled", { p_key: "solaris_app_v3_search", p_edition_id: editionId }),
    client.rpc("studio2_feature_enabled", { p_key: "solaris_app_v3_rules_guidance", p_edition_id: editionId }),
    client.rpc("studio2_feature_enabled", { p_key: "solaris_app_v3_me", p_edition_id: editionId }),
    client.rpc("studio2_feature_enabled", { p_key: "solaris_app_v3_results", p_edition_id: editionId }),
    client.rpc("studio2_feature_enabled", { p_key: "solaris_app_v3_entry", p_edition_id: editionId }),
    client.rpc("studio2_feature_enabled", { p_key: "solaris_app_v3_jury", p_edition_id: editionId }),
  ]);

  if (globalFlag.error) return disabledProbe({ editionId, userId });

  const enabled = globalFlag.data === true;
  const confirmationEnabled = enabled && !confirmationFlag.error && confirmationFlag.data === true;
  const scoreboardEnabled = enabled && !scoreboardFlag.error && scoreboardFlag.data === true;
  const accountSettingsEnabled =
    enabled && !accountSettingsFlag.error && accountSettingsFlag.data === true;
  const exploreEnabled = enabled && !exploreFlag.error && exploreFlag.data === true;
  const editionHubEnabled =
    enabled && exploreEnabled && !editionHubFlag.error && editionHubFlag.data === true;
  const notificationsEnabled =
    accountSettingsEnabled && !notificationsFlag.error && notificationsFlag.data === true;
  const delegationEnabled =
    enabled && exploreEnabled && !delegationFlag.error && delegationFlag.data === true;
  const searchEnabled = enabled && !searchFlag.error && searchFlag.data === true;
  const rulesGuidanceEnabled =
    enabled && !rulesGuidanceFlag.error && rulesGuidanceFlag.data === true;

  return {
    enabled,
    confirmationEnabled,
    scoreboardEnabled,
    accountSettingsEnabled,
    exploreEnabled,
    editionHubEnabled,
    notificationsEnabled,
    delegationEnabled,
    searchEnabled,
    rulesGuidanceEnabled,
    meEnabled: enabled && !meFlag.error && meFlag.data === true,
    resultsEnabled: enabled && !resultsFlag.error && resultsFlag.data === true,
    entryEnabled: enabled && !entryFlag.error && entryFlag.data === true,
    juryEnabled: enabled && !juryFlag.error && juryFlag.data === true,
    editionId,
    userId,
  };
}

/** Cheap, fail-closed V3 rollout probe for the current public edition. */
export async function loadV3RolloutProbe(): Promise<V3RolloutProbe> {
  try {
    const publicClient = createConfirmationPublicRuntimeClient() as unknown as RolloutClient;
    const editionResult = await publicClient
      .from("editions")
      .select(EDITION_COLUMNS)
      .eq("published", true)
      .order("edition_number", { ascending: false });

    if (editionResult.error) return disabledProbe();

    const edition = resolveCurrentPublicEdition((editionResult.data ?? []) as Edition[]);
    return evaluateV3Rollout(publicClient, edition?.id ?? null);
  } catch {
    return disabledProbe();
  }
}

/** Edition-route variant. Browser slug never supplies the authority scope. */
export async function loadV3EditionRolloutProbe(slug: string): Promise<V3RolloutProbe> {
  const cleanSlug = slug.trim();
  if (!cleanSlug) return disabledProbe();

  try {
    const publicClient = createConfirmationPublicRuntimeClient() as unknown as RolloutClient;
    const editionResult = await publicClient
      .from("editions")
      .select("id")
      .eq("slug", cleanSlug)
      .eq("published", true)
      .maybeSingle();

    if (editionResult.error || !editionResult.data?.id) return disabledProbe();
    return evaluateV3Rollout(publicClient, String(editionResult.data.id));
  } catch {
    return disabledProbe();
  }
}
