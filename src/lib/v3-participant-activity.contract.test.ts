import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const source = () => read("src/integrations/v3/participant-activity.server.ts");
const functions = () => read("src/lib/v3-participant-activity.functions.ts");
const runtime = () => read("src/lib/v3-participant-activity-runtime.ts");
const screen = () => read("src/components/v3/V3ParticipantActivityScreen.tsx");
const route = () => read("src/routes/_authenticated/my-solaris/activity.tsx");

describe("V3 participant activity architecture", () => {
  it("reads only the recipient-scoped System projection", () => {
    expect(source()).toContain('rpc("v3_my_participant_activity"');
    expect(source()).not.toContain("content_events");
    expect(source()).not.toContain("notification");
    expect(source()).not.toContain("localStorage");
    expect(functions()).not.toContain("userId");
    expect(functions()).not.toContain("countryId");
    expect(functions()).not.toContain("editionId");
  });

  it("fails closed while SYSTEM CONTRACT REQUEST #605 is unavailable", () => {
    expect(source()).toContain("missingParticipantActivityContract");
    expect(source()).toContain("emptyV3ParticipantActivityBundle");
    expect(screen()).toContain('data-v3-participant-activity-state="unavailable"');
    expect(screen()).toContain("will not reconstruct private activity");
  });

  it("keeps installed-app cutover reversible behind the Me rollout", () => {
    expect(route()).toContain("rollout.data.meEnabled === true");
    expect(route()).toContain("<V3ParticipantActivityScreen viewerId={rollout.data.userId} />");
    expect(route()).toContain('<MySolarisPersonalPage view="activity" />');
    expect(route()).toContain('content: "noindex, nofollow"');
  });

  it("never reuses another signed-in viewer's private activity cache", () => {
    expect(route()).toContain("useAuthenticatedUser");
    expect(route()).toContain("rollout.data.userId === authenticatedUser.id");
    expect(route()).toContain("rollout.data.userId !== authenticatedUser.id");
    expect(screen()).toContain("const authenticatedUser = useAuthenticatedUser()");
    expect(screen()).toContain("const ownsIdentity = viewerId === authenticatedUser.id");
    expect(screen()).toContain("useV3ParticipantActivity(ownsIdentity ? viewerId : null, ownsIdentity)");
    expect(screen()).toContain("if (!ownsIdentity)");
    expect(runtime()).toContain("v3ParticipantActivityQueryKey(scopedViewerId)");
    expect(runtime()).toContain("enabled: enabled && Boolean(scopedViewerId)");
    expect(runtime()).not.toContain('queryKey: ["v3-participant-activity"]');
    expect(source()).not.toContain("p_user_id");
  });

  it("renders reconciliation state rather than hiding stale history", () => {
    expect(screen()).toContain("Superseded");
    expect(screen()).toContain("Unavailable");
    expect(screen()).toContain('data-v3-activity-state={item.reconciliationState}');
  });
});
