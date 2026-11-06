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
    expect(route).toContain('.eq("profile_id", viewerId)');
    expect(route).toContain('.from("fantasy_team_entries")');
    expect(route).toContain('.eq("team_id", myTeam.data!.id)');
    expect(route).toContain("restoreV3FantasyRoster(myTeam.data, myTeamEntries.data)");
    expect(route).toContain('queryKey: ["fantasy-my-team-entries", viewerId, myTeam.data?.id]');
  });

  it("exposes all games and historical editions in both installed-app and web Fantasy", () => {
    expect(route).toContain("games={games.data ?? []}");
    expect(route).toContain("onGame={selectGame}");
    expect(screen).toContain("availableGames.length > 1");
    expect(screen).toContain("onChange={(event) => onGame?.(event.target.value)}");
    expect(route).toContain("onChange={(event) => selectGame(event.target.value)}");
    expect(route).toContain("setSelected([])");
    expect(route).toContain('setCaptain("")');
  });

  it("makes invalid or retired saved Fantasy entries removable on both app and web before resubmission", () => {
    expect(screen).toContain("invalidSelection.length");
    expect(screen).toContain("onClick={() => onToggle(id)}");
    expect(screen).toContain("no longer eligible");
    expect(route).toContain("ineligibleSavedCountries.length > 0");
    expect(route).toContain("Review your saved roster");
    expect(route).toContain("!rosterReady");
    expect(projection).toContain("eligibleCosts.has(countryId)");
  });

  it("does not present an unavailable or unauthorized game as a legitimate empty state", () => {
    expect(route).toContain("const loadingError = session.isError || games.isError || choices.isError || myTeam.isError || myTeamEntries.isError");
    expect(route).toContain("Fantasy data could not be loaded");
    expect(route).toContain("No roster changes have been submitted");
    expect(route).toContain("Retry loading");
  });

  it("never reuses private Fantasy team caches or drafts across accounts or games", () => {
    expect(route).toContain("useFanSession()");
    expect(route).toContain('queryKey: ["fantasy-my-team", activeGame?.id, viewerId]');
    expect(route).toContain('queryKey: ["fantasy-my-team-entries", viewerId, myTeam.data?.id]');
    expect(route).toContain("myTeam.data?.profile_id === viewerId");
    expect(route).toContain("auth.user?.id !== viewerId");
    expect(route).toContain("gcTime: 0");
    expect(route).toContain('const rosterScope = `${viewerId ?? "anonymous"}:${activeGame?.id ?? "none"}`');
    expect(route).toContain("draftScope === rosterScope ? selected : []");
    expect(route).toContain("draftScope === rosterScope ? captain :");
    expect(route).toContain("viewerId={viewerId}");
  });

  it("retains unsaved local edits across background refetch without accepting a different account's draft", () => {
    expect(route).toContain("shouldRestoreV3FantasyRoster({ rosterScope, draftScope, draftDirty })");
    expect(route).toContain("setDraftDirty(true)");
    expect(route).toContain("setDraftDirty(false)");
    expect(route).toContain("if (locked || submit.isPending) return;");
    expect(route).toContain("dirty={draftScope === rosterScope && draftDirty}");
    expect(screen).toContain("disabled={locked || submitting}");
    expect(screen).toContain("Unsaved roster changes");
    expect(projection).toContain("input.rosterScope !== input.draftScope");
  });

  it("gates personal scores and public standings until canonical game scoring completes", () => {
    expect(projection).toContain('game?.status === "scored"');
    expect(projection).toContain('if (game.status === "scored") return "settled";');
    expect(projection).not.toContain('game.status === "scored" || team?.state === "scored"');
    expect(route).toContain('enabled: activeGame?.status === "scored"');
    expect(route).toContain('standings={activeGame.status === "scored" ? (leaderboard.data ?? []) : []}');
    expect(route).toContain("canShowV3FantasyTeamScore(activeGame, myTeam.data)");
    expect(screen).toContain("canShowV3FantasyTeamScore(game, team)");
    expect(screen).toContain('meta={state === "settled" ? "Published scoring" : "When available"}');
  });

  it("keeps roster mutation on the existing server-authoritative Fantasy writer", () => {
    expect(route).toContain("fantasyRosterReady({ game: activeGame, selected: rosterSelected, choices: choices.data ?? [] })");
    expect(route).toContain('.rpc("submit_fantasy_team"');
    expect(route).toContain("_game_id: intent.gameId");
    expect(route).toContain("_country_ids: intent.countryIds");
    expect(route).toContain("_captain_country_id: intent.captainId");
    expect(route).toContain("countryIds: [...rosterSelected]");
    expect(route).not.toContain("localStorage");
    expect(route).not.toContain("sessionStorage");
  });

  it("pins an in-flight save to its original account/game and cannot clear another draft", () => {
    expect(route).toContain("const latestRosterScope = useRef(rosterScope)");
    expect(route).toContain("latestRosterScope.current = rosterScope");
    expect(route).toContain("latestRosterScope.current !== intent.scope");
    expect(route).toContain("activeGame.id !== intent.gameId");
    expect(route).toContain("auth.user?.id !== intent.viewerId");
    expect(route).toContain('queryKey: ["fantasy-my-team", intent.gameId, intent.viewerId]');
    expect(route).toContain('queryKey: ["fantasy-my-team-entries", intent.viewerId]');
    expect(route).toContain("if (latestRosterScope.current === intent.scope) setDraftDirty(false)");
    expect(route).toContain("onSubmit={submitRoster}");
    expect(route).toContain("onClick={submitRoster}");
    expect(route).toContain("submit.variables?.scope === rosterScope");
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
  it("never presents failed, paused, pending or unpublished Fantasy leaderboard reads as empty scores", () => {
    expect(projection).toContain("normalizeV3FantasyStandings(payload: unknown)");
    expect(route).toContain("return normalizeV3FantasyStandings(data ?? [])");
    expect(route).toContain('activeGame?.status !== "scored" ? "unpublished"');
    expect(route).toContain('leaderboard.isError ? "error"');
    expect(route).toContain('leaderboard.isPending && leaderboard.isPaused ? "paused"');
    expect(route).toContain('leaderboard.isPending ? "loading"');
    expect(route).toContain("standingsState={standingsState}");
    expect(route).toContain("onRetryStandings={() => void leaderboard.refetch()}");
    expect(screen).toContain('standingsState === "error" ? (');
    expect(screen).toContain('standingsState === "paused" ? (');
    expect(screen).toContain('standingsState === "loading" ? (');
    expect(screen).toContain('data-v3-fantasy-standings-state="error"');
    expect(screen).toContain("onClick={onRetryStandings}");
    expect(route).toContain("Retry standings");
  });

  it("distinguishes rollout read failure from a feature explicitly disabled by the server", () => {
    expect(route).toContain("Fantasy availability could not be verified");
    expect(route).toContain("feature.isPending && feature.isPaused ? (");
    expect(route).toContain("feature.refetch()");
    expect(route).toContain("This does not mean Fantasy is disabled.");
    expect(route.indexOf("{feature.isError ? (")).toBeLessThan(route.indexOf(") : feature.data !== true ? ("));
  });

});
