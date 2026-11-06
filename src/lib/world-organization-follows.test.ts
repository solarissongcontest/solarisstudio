import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));
import {
  getWorldOrganizationFollow,
  setWorldOrganizationFollow,
  setWorldFollowCategory,
  WORLD_ORGANIZATION_FOLLOW_CATEGORIES,
} from "./world-organization-follows";

const viewer = "11111111-1111-4111-8111-111111111111";
const org = "22222222-2222-4222-8222-222222222222";
const follow = "33333333-3333-4333-8333-333333333333";
const row = { id: follow, profile_id: viewer, entity_type: "organization",
  entity_id: org, notification_level: "important" };

function arrangeQuery(returnRow: unknown = row, categories: unknown = []) {
  const followBuilder: any = {};
  followBuilder.select = vi.fn(() => followBuilder);
  followBuilder.eq = vi.fn(() => followBuilder);
  followBuilder.maybeSingle = vi.fn(async () => ({ data: returnRow, error: null }));
  const categoryBuilder: any = {};
  categoryBuilder.select = vi.fn(() => categoryBuilder);
  categoryBuilder.eq = vi.fn(() => categoryBuilder);
  categoryBuilder.limit = vi.fn(async () => ({ data: categories, error: null }));
  mocks.from.mockImplementation((name: string) =>
    name === "fan_follows" ? followBuilder : categoryBuilder);
  return { followBuilder, categoryBuilder };
}

describe("TG10 organization follows: same authority, private recipient scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads exactly one actor and organization follow, then bounded own categories", async () => {
    const q = arrangeQuery(row, [{ category: "leadership", enabled: false }]);
    const state = await getWorldOrganizationFollow(viewer, org);
    expect(state?.followId).toBe(follow);
    expect(state?.categories.leadership).toBe(false);
    expect(state?.categories.statements).toBe(true);
    expect(q.followBuilder.select).toHaveBeenCalledWith(
      "id,profile_id,entity_type,entity_id,notification_level");
    expect(q.followBuilder.eq).toHaveBeenCalledWith("profile_id", viewer);
    expect(q.followBuilder.eq).toHaveBeenCalledWith("entity_type", "organization");
    expect(q.followBuilder.eq).toHaveBeenCalledWith("entity_id", org);
    expect(q.categoryBuilder.eq).toHaveBeenCalledWith("follow_id", follow);
    expect(q.categoryBuilder.limit).toHaveBeenCalledWith(
      WORLD_ORGANIZATION_FOLLOW_CATEGORIES.length);
  });

  it("rejects a returned cross-user follow despite RLS", async () => {
    arrangeQuery({ ...row, profile_id: "44444444-4444-4444-8444-444444444444" });
    await expect(getWorldOrganizationFollow(viewer, org)).rejects.toThrow("invalid");
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("does not query categories when the actor has no follow", async () => {
    arrangeQuery(null);
    await expect(getWorldOrganizationFollow(viewer, org)).resolves.toBeNull();
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed or duplicate returned category rows", async () => {
    arrangeQuery(row, [{ category: "leadership", enabled: true },
      { category: "leadership", enabled: false }]);
    await expect(getWorldOrganizationFollow(viewer, org)).rejects.toThrow("invalid");
  });

  it("calls existing set_fan_follow, never creates a raw follow row", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await expect(setWorldOrganizationFollow(org, true, "important")).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("set_fan_follow", {
      _entity_type: "organization", _entity_id: org,
      _following: true, _notification_level: "important",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("requires real RPC confirmation and rejects unknown categories", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(setWorldOrganizationFollow(org, true)).rejects.toThrow("not confirmed");
    await expect(setWorldFollowCategory(follow, "secret_votes" as any, true))
      .rejects.toThrow("Invalid");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("only changes a category through owner-scoped world_set_follow_category_v1", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(setWorldFollowCategory(follow, "leadership", false)).resolves.toBeUndefined();
    expect(mocks.rpc).toHaveBeenCalledWith("world_set_follow_category_v1", {
      p_follow_id: follow, p_category: "leadership", p_enabled: false,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("port of #2043 preserves canonical S5 identity, server rollout and local RLS fixture", () => {
    const sql = readFileSync(
      "supabase/migrations/20261104133000_v3_tg10_organization_follow_preferences.sql", "utf8");
    const fixture = readFileSync("scripts/rehearse-v3-world-organization-follows.sql", "utf8");
    const runner = readFileSync("scripts/rehearse-v3-world-organization-follows.sh", "utf8");
    const ui = readFileSync("src/components/world/WorldOrganizationFollowControl.tsx", "utf8");
    expect(sql).toContain("create or replace function public.set_fan_follow(");
    expect(sql).toContain("private.v3_fan_follow_operation_id(");
    expect(sql).toContain("public.studio2_feature_enabled('terra_world_public', null)");
    expect(sql).toContain("organization_row.public_visibility = 'public'");
    expect(sql).toContain("public.fan_follow_categories");
    expect(sql).toContain("follow_row.profile_id=v_actor");
    expect(sql).toContain("grant select on public.fan_follow_categories to service_role");
    expect(sql).not.toMatch(/create table (?:public\.)?world_follows/i);
    expect(sql).not.toContain("grant all on public.fan_follow_categories to service_role");
    for (const evidence of ["TG10_PRIVATE_ORGANIZATION_FOLLOW_ALLOWED",
      "TG10_FOREIGN_CATEGORY_UPDATE_ALLOWED", "TG10_FOREIGN_CATEGORY_READ_ALLOWED",
      "TG10_UNFOLLOW_S5_RECEIPT_EVENT_MISSING", "rollback;"]) {
      expect(fixture).toContain(evidence);
    }
    expect(runner).toContain("Refusing non-loopback database");
    expect(ui).toContain("useFanSession()");
    expect(ui).toContain('to="/auth"');
    expect(ui).toContain("Required institutional responsibilities");
    expect(ui).not.toContain(".insert(");
  });
});
