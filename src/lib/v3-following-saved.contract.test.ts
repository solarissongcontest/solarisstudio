import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = () => read("src/routes/_authenticated/my-solaris/saved.tsx");
const screen = () => read("src/components/v3/V3FollowingSavedScreen.tsx");
const projection = () => read("src/lib/v3-following-saved.ts");
const projectionData = () => read("src/lib/v3-following-saved-data.ts");
const integrationData = () => read("src/integrations/v3/following-saved-data.ts");
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
    expect(integrationData()).toContain("follow.profile_id === profileId");
    expect(screen()).toContain("projection && !projection.scoped");
    expect(screen()).not.toContain("localStorage");
  });

  it("keeps database IO in the integration layer", () => {
    expect(projectionData()).toContain('@/integrations/v3/following-saved-data');
    expect(projectionData()).not.toContain("integrations/supabase");
    expect(projectionData()).not.toContain('.from("');
    expect(integrationData()).toContain('@/integrations/supabase/client');
  });

  it("resolves only followed entity IDs instead of loading public catalogues", () => {
    expect(screen()).toContain("useV3FollowEntityDetails(viewerId, followRows)");
    expect(screen()).not.toContain("useCountries");
    expect(screen()).not.toContain("useEditions");
    expect(screen()).not.toContain("useAllShows");
    expect(integrationData()).toContain('.from("countries")');
    expect(integrationData()).toContain('.from("shows")');
    expect(integrationData()).toContain('.from("editions")');
    expect(integrationData()).toContain('.in("id", countryIds)');
    expect(integrationData()).toContain('.in("id", showIds)');
    expect(integrationData()).toContain('.in("id", editionIds)');
    expect(integrationData()).toContain('.eq("published", true)');
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

  it("reconciles successful and uncertain writes against refreshed server state", () => {
    expect(screen()).toContain("const reconciled = await follows.refetch()");
    expect(screen()).toContain("v3FollowPreferenceMatches({");
    expect(screen()).toContain("has not confirmed it yet");
    expect(screen()).toContain("could not confirm whether that preference was saved");
    expect(projection()).toContain("export function v3FollowPreferenceMatches");
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
