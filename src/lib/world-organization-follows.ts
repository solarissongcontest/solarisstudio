import { supabase } from "@/integrations/supabase/client";

/** Canonical categories from the TG10 fan_follow_categories extension. */
export const WORLD_ORGANIZATION_FOLLOW_CATEGORIES = [
  "statements", "resolutions", "leadership", "sessions",
  "documents", "proposals", "membership",
] as const;
export type WorldFollowCategory = typeof WORLD_ORGANIZATION_FOLLOW_CATEGORIES[number];
export type WorldFollowNotificationLevel = "none" | "important" | "all";

export type WorldOrganizationFollowState = {
  followId: string;
  organizationId: string;
  notificationLevel: WorldFollowNotificationLevel;
  /** Missing per-category rows inherit enabled=true; event priority is separate. */
  categories: Record<WorldFollowCategory, boolean>;
};
export const WORLD_FOLLOW_IMPORTANT_CATEGORIES = [
  "statements", "resolutions", "leadership",
] as const satisfies readonly WorldFollowCategory[];

const notificationLevels = new Set<WorldFollowNotificationLevel>(["none", "important", "all"]);
const categorySet = new Set<string>(WORLD_ORGANIZATION_FOLLOW_CATEGORIES);
const isUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
const assertIds = (...ids: string[]) => {
  if (!ids.every(isUuid)) throw new Error("Invalid organization or follow identifier.");
};

type FollowRow = { id: string; profile_id: string; entity_type: string;
  entity_id: string; notification_level: string };
type CategoryRow = { category: string; enabled: boolean };
function isFollowRow(value: unknown, viewerId: string, organizationId: string): value is FollowRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return typeof r.id === "string" && isUuid(r.id) &&
    r.profile_id === viewerId && r.entity_type === "organization" &&
    r.entity_id === organizationId && notificationLevels.has(r.notification_level as WorldFollowNotificationLevel);
}
const defaultCategories = (): Record<WorldFollowCategory, boolean> =>
  Object.fromEntries(WORLD_ORGANIZATION_FOLLOW_CATEGORIES.map((key) => [key, true])) as
    Record<WorldFollowCategory, boolean>;

/**
 * Owner-only private preference query. This does not reveal organization names,
 * memberships or private institution metadata. No "*" or unbounded follow read.
 */
export async function getWorldOrganizationFollow(
  viewerId: string,
  organizationId: string,
): Promise<WorldOrganizationFollowState | null> {
  assertIds(viewerId, organizationId);
  const { data, error } = await (supabase as any)
    .from("fan_follows")
    .select("id,profile_id,entity_type,entity_id,notification_level")
    .eq("profile_id", viewerId)
    .eq("entity_type", "organization")
    .eq("entity_id", organizationId)
    .maybeSingle();
  if (error) throw new Error("Follow preferences could not be loaded.");
  if (data === null) return null;
  if (!isFollowRow(data, viewerId, organizationId))
    throw new Error("Follow response was invalid.");

  const { data: categoryRows, error: categoryError } = await (supabase as any)
    .from("fan_follow_categories")
    .select("category,enabled")
    .eq("follow_id", data.id)
    .limit(WORLD_ORGANIZATION_FOLLOW_CATEGORIES.length);
  if (categoryError || !Array.isArray(categoryRows))
    throw new Error("Follow category preferences could not be loaded.");

  const categories = defaultCategories();
  const seen = new Set<string>();
  for (const candidate of categoryRows) {
    const row = candidate as Partial<CategoryRow>;
    if (typeof row.category !== "string" || !categorySet.has(row.category) ||
        typeof row.enabled !== "boolean" || seen.has(row.category)) {
      throw new Error("Follow category response was invalid.");
    }
    seen.add(row.category);
    categories[row.category as WorldFollowCategory] = row.enabled;
  }
  return { followId: data.id, organizationId, notificationLevel:
    data.notification_level as WorldFollowNotificationLevel, categories };
}

/** Reuses the original S5-governed set_fan_follow operation, not direct DML. */
export async function setWorldOrganizationFollow(
  organizationId: string,
  following: boolean,
  notificationLevel: WorldFollowNotificationLevel = "important",
): Promise<boolean> {
  assertIds(organizationId);
  if (!notificationLevels.has(notificationLevel))
    throw new Error("Invalid notification level.");
  const { data, error } = await (supabase as any).rpc("set_fan_follow", {
    _entity_type: "organization",
    _entity_id: organizationId,
    _following: following,
    _notification_level: notificationLevel,
  });
  if (error) throw new Error(error.message || "Follow preference could not be saved.");
  if (data !== following) throw new Error("Follow preference was not confirmed.");
  return data;
}

/** Per-category user preference, with auth.uid() ownership checked in PostgreSQL. */
export async function setWorldFollowCategory(
  followId: string,
  category: WorldFollowCategory,
  enabled: boolean,
): Promise<void> {
  assertIds(followId);
  if (!categorySet.has(category) || typeof enabled !== "boolean")
    throw new Error("Invalid follow category preference.");
  const { data, error } = await (supabase as any).rpc("world_set_follow_category_v1", {
    p_follow_id: followId,
    p_category: category,
    p_enabled: enabled,
  });
  if (error) throw new Error(error.message || "Follow category could not be saved.");
  if (data !== enabled) throw new Error("Follow category change was not confirmed.");
}
