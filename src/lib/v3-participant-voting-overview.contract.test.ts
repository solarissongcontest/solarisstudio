import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/integrations/v3/primary-surface-source.server.ts",
  "utf8",
);
const projection = readFileSync("src/lib/v3-participate.ts", "utf8");
const screen = readFileSync("src/components/v3/V3ParticipateScreen.tsx", "utf8");
const navigation = readFileSync("src/lib/navigation-targets.ts", "utf8");
const workspaceNavigation = readFileSync("src/lib/my-solaris-navigation.ts", "utf8");
const registry = readFileSync("src/lib/v3-public-capability-registry.ts", "utf8");

describe("V3 participant voting overview", () => {
  it("derives jury from authenticated country voting context", () => {
    expect(source).toContain('client.rpc("country_jury_voting_context")');
    expect(source).toContain('route: "/jury-voting"');
    expect(source).toContain("required: true");
    expect(source).toContain("submitted: round.already_submitted === true");
  });

  it("derives public televote availability from the canonical open-round projection", () => {
    expect(source).toContain('.schema("televoting")');
    expect(source).toContain('.eq("status", "open")');
    expect(source).toContain('route: "/televoting"');
    expect(source).toContain("required: false");
  });

  it("merges both voting modes into Participate without creating another network source", () => {
    expect(projection).toContain('currentVotingAction(bootstrap.actions, "jury")');
    expect(projection).toContain('currentVotingAction(bootstrap.actions, "televote")');
    expect(screen).toContain('title="Voting overview"');
    expect(screen).toContain('data-v3-voting-overview="canonical-actions"');
    expect(screen).toContain("Public voting stays optional even when it is time-sensitive.");
    expect(screen).toContain("Solaris has no canonical");
    expect(screen).not.toContain("useQuery(");
    expect(screen).not.toContain("supabase");
  });

  it("separates the legacy voting deep link from the V3 Participate ownership destination", () => {
    expect(navigation).toContain('mySolarisVoting: "/my-solaris/voting"');
    expect(navigation).toContain('participate: "/participate"');
    expect(workspaceNavigation).toContain("to: NAV_TARGETS.participate");
    expect(workspaceNavigation).toContain(
      "activePaths: [NAV_TARGETS.participate, NAV_TARGETS.mySolarisVoting]",
    );
  });

  it("keeps the migration target owned by Participate while deep-link cutover remains separate", () => {
    const start = registry.indexOf('id: "participant-voting-overview"');
    const end = registry.indexOf("  },", start);
    const capability = registry.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(capability).toContain('classification: "merge"');
    expect(capability).toContain('targetArea: "participate"');
    expect(capability).toContain('targetRoute: "/participate"');
    expect(capability).toContain('acceptanceScenarioId: "public.voting-responsibility-overview"');
  });
});
