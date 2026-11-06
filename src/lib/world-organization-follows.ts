import { supabase } from "@/integrations/supabase/client";
import { fetchWorldPublicEnabled } from "@/lib/terra-world-public";

/**
 * TG10 extends public.fan_follows. This layer owns no follow table, no task
 * rows, and no notification deliveries. Those remain canonical elsewhere.
 */
export const WORLD_ORGANIZATION_FOLLOW_CATEGORIES = [
  "statements", "resolutions", "leadership", "sessions",
  "documents", "proposals", "membership",
] as const;

export type WorldFollowCategory = typeof WORLD_ORGANIZATION_FOLLOW_CATEGORIES[number];
export type WorldFollowLevel = "none" | "important" | "all";

export type WorldOrganizationFollowPreference = {
  followId: string | null;
  following: boolean;
  notificationLevel: WorldFollowLevel;
  /** Absent DB row means the category defaults enabled, NOT disabled. */
  categoryEnabled: Record<WorldFollowCategory, boolean>;
  /** False also covers unavailable/unverifiable publication or disabled rollout. */
  publicAvailable: boolean;
};

const identity = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

export function defaultWorldFollowCategories(): Record<WorldFollowCategory, boolean> {
  return Object.fromEntries(
    WORLD_ORGANIZATION_FOLLOW_CATEGORIES.map((category) => [category, true]),
  ) as Record<WorldFollowCategory, boolean>;
}

export function parseWorldFollowCategoryRows(rows: unknown): Record<WorldFollowCategory, boolean> {
  if (!Array.isArray(rows)) throw new Error("Follow categories could not be verified.");
  const values = defaultWorldFollowCategories();
  const seen = new Set<string>();
  for (const item of rows) {
    const row = object(item);
    if (!row || typeof row.category !== "string" ||
        !WORLD_ORGANIZATION_FOLLOW_CATEGORIES.some((category) => category === row.category) ||
        typeof row.enabled !== "boolean" || seen.has(row.category)) {
      throw new Error("Follow categories could not be verified.");
    }
    const category = row.category as WorldFollowCategory;
    seen.add(category);
    values[category] = row.enabled;
  }
  return values;
}

export function parseWorldOrganizationFollowRow(input: unknown, profileId: string, organizationId: string) {
  if (input === null) return null;
  const row = object(input);
  if (!row || !identity(row.id) || row.profile_id !== profileId ||
      row.entity_type !== "organization" || row.entity_id !== organizationId ||
      !["none", "important", "all"].includes(String(row.notification_level))) {
    throw new Error("Follow state could not be verified.");
  }
  return { id: row.id as string, notificationLevel: row.notification_level as WorldFollowLevel };
}

export async function loadWorldOrganizationFollow(
  profileId: string,
  organizationId: string,
): Promise<WorldOrganizationFollowPreference> {
  if (!identity(profileId) || !identity(organizationId)) {
    throw new Error("Sign in with a valid account to manage institutional follows.");
  }

  // A former follower must still be able to unfollow if World is switched off.
  // The owner-scoped follow row alone reveals no institution metadata.
  const [availability, followResponse] = await Promise.all([
    fetchWorldPublicEnabled().catch(() => false),
    (supabase as any).from("fan_follows")
      .select("id,profile_id,entity_type,entity_id,notification_level")
      .eq("profile_id", profileId)
      .eq("entity_type", "organization")
      .eq("entity_id", organizationId)
      .maybeSingle(),
  ]);
  if (followResponse.error) throw new Error("Follow state could not be loaded.");
  const follow = parseWorldOrganizationFollowRow(
    followResponse.data, profileId, organizationId,
  );
  if (!follow) return {
    followId: null, following: false, notificationLevel: "important",
    categoryEnabled: defaultWorldFollowCategories(), publicAvailable: availability,
  };

  // Only the current user's follow IDs are accepted by the RLS policy. The
  // client also refuses an invalid/mismatched server row; no cached cross-user
  // preference state is shared with other actors or institutions.
  const { data, error } = await (supabase as any).from("fan_follow_categories")
    .select("category,enabled").eq("follow_id", follow.id);
  if (error) throw new Error("Follow categories could not be loaded.");

  return {
    followId: follow.id, following: true,
    notificationLevel: follow.notificationLevel,
    categoryEnabled: parseWorldFollowCategoryRows(data),
    publicAvailable: availability,
  };
}

export async function setWorldOrganizationFollow(
  organizationId: string, following: boolean,
  notificationLevel: WorldFollowLevel = "important",
): Promise<boolean> {
  if (!identity(organizationId) || !["none", "important", "all"].includes(notificationLevel)) {
    throw new Error("Invalid follow preference.");
  }
  // The canonical server command performs live organization publication and
  // authenticated ownership checks. Prechecking the rollout avoids requests to
  // mutate optional public follows while the World feature is dark.
  if (following && !await fetchWorldPublicEnabled()) {
    throw new Error("Institutional following is not available.");
  }
  const { data, error } = await (supabase as any).rpc("set_fan_follow", {
    _entity_type: "organization",
    _entity_id: organizationId,
    _following: following,
    _notification_level: notificationLevel,
  });
  if (error || data !== following) throw new Error(error?.message || "Follow change was not confirmed.");
  return data as boolean;
}

export async function setWorldOrganizationFollowCategory(
  followId: string, category: WorldFollowCategory, enabled: boolean,
): Promise<boolean> {
  if (!identity(followId) || !WORLD_ORGANIZATION_FOLLOW_CATEGORIES.includes(category) ||
      typeof enabled !== "boolean") throw new Error("Invalid follow category.");
  const { data, error } = await (supabase as any).rpc("world_set_follow_category_v1", {
    p_follow_id: followId, p_category: category, p_enabled: enabled,
  });
  if (error || data !== enabled) throw new Error(error?.message || "Category change was not confirmed.");
  return data as boolean;
}
