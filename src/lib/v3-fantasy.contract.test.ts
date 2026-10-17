import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = source("src/routes/fantasy/index.tsx");
const screen = source("src/components/v3/V3FantasyScreen.tsx");
const projection = source("src/lib/v3-fantasy.ts");

 describe("V3 Fantasy architecture", () => {
  it("restores the signed-in user's canonical saved roster from RLS-scoped team entries", () => {
    expect(route).toContain('.from("fantasy_teams")');
    expect(route).toContain('.eq("profile_id", user.id)');
    expect(route).toContain('.from("fantasy_team_entries")');
    expect(route).toContain('.eq("team_id", myTeam.data!.id)');
    expect(route).toContain("restoreV3FantasyRoster(myTeam.data, myTeamEntries.data)");
    expect(route).toContain('queryKey: ["fantasy-my-team-entries", myTeam.data?.id]');
  });

  it("keeps roster mutation on the existing server-authoritative Fantasy writer", () => {
    expect(route).toContain('.rpc("submit_fantasy_team"');
    expect(route).toContain("_game_id: activeGame.id");
    expect(route).toContain("_country_ids: selected");
    expect(route).toContain("_captain_country_id: captain || null");
    expect(route).not.toContain("localStorage");
    expect(route).not.toContain("sessionStorage");
  });

  it("keeps V3 installed-app cutover reversible behind server-evaluated rollout", () => {
    expect(route).toContain("useV3RolloutProbe(platformResolved && isAppMode)");
    expect(route).toContain("rollout.data?.enabled === true");
    expect(route).toContain("feature.data === true");
    expect(route).toContain("<V3FantasyScreen");
    expect(route).toContain("<AppShell>");
  });

  it("does not let the V3 surface claim authority over lock, budget or scoring", () => {
    expect(screen).toContain("server lock");
    expect(screen).toContain("authoritative scoring workflow");
    expect(screen).toContain("fantasyRosterReady");
    expect(projection).toContain("canEditV3FantasyRoster");
    expect(projection).not.toContain('"archived"');
  });
});
