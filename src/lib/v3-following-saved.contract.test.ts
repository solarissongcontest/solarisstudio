import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = () => read("src/routes/_authenticated/my-solaris/saved.tsx");
const screen = () => read("src/components/v3/V3FollowingSavedScreen.tsx");
const projection = () => read("src/lib/v3-following-saved.ts");
const engagement = () => read("src/lib/engagement-data.ts");

describe("V3 Following & Saved architecture", () => {
  it("keeps installed-app cutover reversible behind the Me rollout", () => {
    expect(route()).toContain("rollout.data.meEnabled === true");
    expect(route()).toContain("<V3FollowingSavedScreen viewerId={rollout.data.userId} />");
    expect(route()).toContain('<MySolarisPersonalPage view="saved" />');
    expect(route()).toContain('content: "noindex, nofollow"');
  });

  it("keeps private reads scoped and fails closed on cross-profile rows", () => {
    expect(screen()).toContain("useMyFollows(viewerId)");
    expect(engagement()).toContain('.from("fan_follows")');
    expect(engagement()).toContain('.eq("profile_id", profileId!)');
    expect(projection()).toContain("scoped: false");
    expect(screen()).toContain("projection && !projection.scoped");
    expect(screen()).not.toContain("localStorage");
  });

  it("uses the existing authenticated follow writer without caller-selected profile authority", () => {
    expect(screen()).toContain("useSetFanFollow(viewerId)");
    expect(screen()).toContain("setFollow.mutateAsync({");
    expect(engagement()).toContain('supabase.rpc("set_fan_follow"');
    expect(engagement()).toContain("_entity_type: entityType");
    expect(engagement()).toContain("_entity_id: entityId");
    expect(engagement()).toContain("_following: following");
    expect(engagement()).toContain("_notification_level: notificationLevel");
    expect(engagement()).not.toMatch(/set_fan_follow[\s\S]{0,350}_profile_id/);
  });

  it("lets users manage both follow state and notification level", () => {
    expect(screen()).toContain("All updates");
    expect(screen()).toContain("Important only");
    expect(screen()).toContain("Saved only");
    expect(screen()).toContain("onRemove={() => void updateFollow(item, false)}");
    expect(screen()).toContain("onLevel={(level) => void updateFollow(item, true, level)}");
  });

  it("fails closed on missing schema or unsafe account scope", () => {
    expect(screen()).toContain('data-v3-following-saved-state="unavailable"');
    expect(screen()).toContain('data-v3-following-saved-state="scope-error"');
    expect(screen()).toContain("No saved entities are shown until account scope is authoritative.");
  });
});
