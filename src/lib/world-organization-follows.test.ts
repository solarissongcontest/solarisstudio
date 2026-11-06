import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  rollout: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: state.rpc, from: state.from },
}));
vi.mock("@/lib/terra-world-public", () => ({
  fetchWorldPublicEnabled: state.rollout,
}));

import {
  defaultWorldFollowCategories,
  loadWorldOrganizationFollow,
  parseWorldFollowCategoryRows,
  parseWorldOrganizationFollowRow,
  setWorldOrganizationFollow,
  setWorldOrganizationFollowCategory,
  WORLD_ORGANIZATION_FOLLOW_CATEGORIES,
} from "./world-organization-follows";

const profileId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const followId = "33333333-3333-4333-8333-333333333333";

function installQueries(
  follow: unknown,
  categories: unknown = [{ category: "statements", enabled: false }],
) {
  const followChain: any = {};
  followChain.select = vi.fn(() => followChain);
  followChain.eq = vi.fn(() => followChain);
  followChain.maybeSingle = vi.fn(async () => ({ data: follow, error: null }));
  const categoryChain: any = {};
  categoryChain.select = vi.fn(() => categoryChain);
  categoryChain.eq = vi.fn(async () => ({ data: categories, error: null }));
  state.from.mockImplementation((table: string) => {
    if (table === "fan_follows") return followChain;
    if (table === "fan_follow_categories") return categoryChain;
    throw new Error("Unexpected database table " + table);
  });
  return { followChain, categoryChain };
}

describe("TG10 organization follows reuse canonical fan follow authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rollout.mockResolvedValue(true);
  });

  it("treats absent category rows as enabled, never invents categories", () => {
    expect(WORLD_ORGANIZATION_FOLLOW_CATEGORIES).toEqual([
      "statements", "resolutions", "leadership", "sessions",
      "documents", "proposals", "membership",
    ]);
    expect(Object.values(defaultWorldFollowCategories())).toEqual(Array(7).fill(true));
    expect(parseWorldFollowCategoryRows([
      { category: "statements", enabled: false },
    ])).toMatchObject({ statements: false, resolutions: true });
    expect(() => parseWorldFollowCategoryRows([
      { category: "statements", enabled: true },
      { category: "statements", enabled: false },
    ])).toThrow();
    expect(() => parseWorldFollowCategoryRows([
      { category: "unpublished_secret", enabled: true },
    ])).toThrow();
  });

  it("rejects a foreign follow row regardless of server table response", () => {
    expect(() => parseWorldOrganizationFollowRow({
      id: followId, profile_id: profileId, entity_id: organizationId,
      entity_type: "organization", notification_level: "important",
    }, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", organizationId)).toThrow();
  });

  it("loads only owner and exact organization, never a global follows query", async () => {
    const { followChain, categoryChain } = installQueries({
      id: followId, profile_id: profileId,
      entity_id: organizationId, entity_type: "organization",
      notification_level: "important",
    });
    await expect(loadWorldOrganizationFollow(profileId, organizationId)).resolves.toEqual({
      followId, following: true, notificationLevel: "important",
      publicAvailable: true,
      categoryEnabled: { ...defaultWorldFollowCategories(), statements: false },
    });
    expect(followChain.select).toHaveBeenCalledWith("id,profile_id,entity_type,entity_id,notification_level");
    expect(followChain.eq.mock.calls).toEqual([
      ["profile_id", profileId], ["entity_type", "organization"], ["entity_id", organizationId],
    ]);
    expect(categoryChain.select).toHaveBeenCalledWith("category,enabled");
    expect(categoryChain.eq).toHaveBeenCalledWith("follow_id", followId);
    expect(state.from).toHaveBeenCalledTimes(2);
  });

  it("allows an existing user to load owner-only state and unfollow when rollout turns dark", async () => {
    state.rollout.mockRejectedValue(new Error("Rollout check failed"));
    installQueries({
      id: followId, profile_id: profileId,
      entity_id: organizationId, entity_type: "organization",
      notification_level: "none",
    }, []);
    const result = await loadWorldOrganizationFollow(profileId, organizationId);
    expect(result.publicAvailable).toBe(false);
    expect(result.following).toBe(true);
    state.rpc.mockResolvedValue({ data: false, error: null });
    await expect(setWorldOrganizationFollow(organizationId, false, "none")).resolves.toBe(false);
    expect(state.rpc).toHaveBeenCalledWith("set_fan_follow", {
      _entity_type: "organization",
      _entity_id: organizationId,
      _following: false,
      _notification_level: "none",
    });
  });

  it("denies new follows before reaching server while rollout is unavailable", async () => {
    state.rollout.mockResolvedValue(false);
    await expect(setWorldOrganizationFollow(organizationId, true)).rejects.toThrow("not available");
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("returns only an acknowledged server follow result", async () => {
    state.rpc.mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    await expect(setWorldOrganizationFollow(organizationId, true, "all")).resolves.toBe(true);
    await expect(setWorldOrganizationFollow(organizationId, true, "all")).rejects.toThrow("not confirmed");
    expect(state.rpc).toHaveBeenCalledTimes(2);
  });

  it("updates categories exclusively through owner-scoped canonical RPC", async () => {
    state.rpc.mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    await expect(setWorldOrganizationFollowCategory(followId, "leadership", false))
      .resolves.toBe(false);
    expect(state.rpc).toHaveBeenCalledWith("world_set_follow_category_v1", {
      p_follow_id: followId, p_category: "leadership", p_enabled: false,
    });
    await expect(setWorldOrganizationFollowCategory(followId, "leadership", false))
      .rejects.toThrow("not confirmed");
  });

  it("does not expose categories for an account with no saved follow", async () => {
    installQueries(null);
    await expect(loadWorldOrganizationFollow(profileId, organizationId)).resolves.toMatchObject({
      followId: null, following: false,
    });
    expect(state.from).toHaveBeenCalledTimes(1);
  });
});
