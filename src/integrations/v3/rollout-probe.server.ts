import { getRequestHeader } from "@tanstack/react-start/server";

import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import { resolveCurrentPublicEdition } from "@/lib/current-contest-state";
import type { Edition } from "@/lib/data";

const EDITION_COLUMNS =
  "id,edition_number,name,year,slug,description,host_country_id,host_city,logo,theme_id,status,published";

const ROLLOUT_FEATURE_KEYS = [
  "solaris_app_v3",
  "solaris_app_v3_confirmation",
  "solaris_app_v3_scoreboard",
  "solaris_app_v3_account_settings",
  "solaris_app_v3_explore",
  "solaris_app_v3_edition_hub",
  "solaris_app_v3_notifications",
  "solaris_app_v3_delegation",
  "solaris_app_v3_search",
  "solaris_app_v3_rules_guidance",
  "solaris_app_v3_me",
  "solaris_app_v3_results",
  "solaris_app_v3_entry",
  "solaris_app_v3_jury",
  "solaris_app_v3_live",
  "solaris_app_v3_organizer",
] as const;

type RolloutFeatureKey = (typeof ROLLOUT_FEATURE_KEYS)[number];

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
  liveEnabled: boolean;
  organizerEnabled?: boolean;
  editionId: string | null;
  userId: string | null;
};

type FeatureSnapshotRow = {
  flag_key: string;
  enabled: boolean;
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
    liveEnabled: false,
    organizerEnabled: false,
    editionId: input?.editionId ?? null,
    userId: input?.userId ?? null,
  };
}

function featureSnapshot(data: unknown) {
  if (!Array.isArray(data)) return null;

  const requested = new Set<string>(ROLLOUT_FEATURE_KEYS);
  const resolved = new Map<RolloutFeatureKey, boolean>();

  for (const value of data) {
    if (!value || typeof value !== "object") return null;
    const row = value as Partial<FeatureSnapshotRow>;
    if (
      typeof row.flag_key !== "string" ||
      typeof row.enabled !== "boolean" ||
      !requested.has(row.flag_key) ||
      resolved.has(row.flag_key as RolloutFeatureKey)
    ) {
      return null;
    }
    resolved.set(row.flag_key as RolloutFeatureKey, row.enabled);
  }

  // Missing rows are not accepted as an implicit allow/deny guess. The RPC is
  // required to return every requested key, including unknown keys as false.
  if (resolved.size !== ROLLOUT_FEATURE_KEYS.length) return null;
  return resolved;
}

async function evaluateV3Rollout(
  publicClient: RolloutClient,
  editionId: string | null,
): Promise<V3RolloutProbe> {
  const { client, userId } = await rolloutClientForRequest(publicClient);
  const snapshot = await client.rpc("studio2_feature_flags_snapshot", {
    p_keys: [...ROLLOUT_FEATURE_KEYS],
    p_edition_id: editionId,
  });

  if (snapshot.error) return disabledProbe({ editionId, userId });
  const flags = featureSnapshot(snapshot.data);
  if (!flags) return disabledProbe({ editionId, userId });

  const flag = (key: RolloutFeatureKey) => flags.get(key) === true;
  const enabled = flag("solaris_app_v3");
  const confirmationEnabled = enabled && flag("solaris_app_v3_confirmation");
  const scoreboardEnabled = enabled && flag("solaris_app_v3_scoreboard");
  const accountSettingsEnabled = enabled && flag("solaris_app_v3_account_settings");
  const exploreEnabled = enabled && flag("solaris_app_v3_explore");
  const editionHubEnabled = enabled && exploreEnabled && flag("solaris_app_v3_edition_hub");
  const notificationsEnabled = accountSettingsEnabled && flag("solaris_app_v3_notifications");
  const delegationEnabled = enabled && exploreEnabled && flag("solaris_app_v3_delegation");
  const searchEnabled = enabled && flag("solaris_app_v3_search");
  const rulesGuidanceEnabled = enabled && flag("solaris_app_v3_rules_guidance");

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
    meEnabled: enabled && flag("solaris_app_v3_me"),
    resultsEnabled: enabled && flag("solaris_app_v3_results"),
    entryEnabled: enabled && flag("solaris_app_v3_entry"),
    juryEnabled: enabled && flag("solaris_app_v3_jury"),
    liveEnabled: enabled && flag("solaris_app_v3_live"),
    organizerEnabled: enabled && flag("solaris_app_v3_organizer"),
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
